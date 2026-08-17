import { DEEP_CONTESTS } from "@/utils/contests";
import { createClient } from "@supabase/supabase-js";
import type { Address } from "viem";
import {
  LEADERBOARD_PERIODS,
  type LeaderboardRow,
  computeRoi,
  expandContestMarketIds,
  listAllLeaderboardAddresses,
  listContestCandidates,
  mergeRows,
  withExecutors,
  readContestLeaderboard,
  readRefreshCursor,
  writeContestLeaderboard,
  writeRefreshCursor,
} from "./utils/leaderboard";
import { readOwnerMap, refreshOwnerMap, type OwnerMap } from "./utils/executorOwners";
import { computePortfolioPlAllPeriods } from "./utils/pnl/portfolioPlCompute";
import { parseCollateralProfileQueryParam } from "./utils/pnl/resolveCollateralParam";
import type { PortfolioPlPeriod } from "./utils/pnl/seerIndexerPortfolio";
import type { Database } from "./utils/pnl/supabase";

const supabase = createClient<Database>(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

/**
 * Per-contest P/L leaderboard refresh.
 *
 * Seer materializes a leaderboard per *app* (`pnl_leaderboard`, `app_id='deepfund'`), which is
 * the whole of deep funding in one board. Per-contest rows have to be computed here.
 *
 * This has to be a background function: the heaviest wallet takes ~145 s over Round 2 · L2's
 * 213 markets, and Seer's synchronous `get-portfolio-pl` is capped at 26 s — it 504s on that
 * wallet with as few as ten market ids. Background functions get ~15 minutes instead.
 */

/**
 * Stay under Netlify's ~15m background limit. The budget is only checked between wallets, and
 * a Round 2 · L2 wallet can take over two minutes, so 11 minutes leaves room for one more
 * wallet plus the closing writes rather than being killed mid-flush.
 *
 * `LEADERBOARD_REFRESH_BUDGET_MS` overrides it. Only set it locally: a full lap over all five
 * contests is hours of compute, so a backfill that has to complete in one process needs a
 * budget no deployed function may have. Setting it in Netlify would just get the run killed
 * mid-contest at 15 minutes.
 */
const DEFAULT_REFRESH_BUDGET_MS = 11 * 60 * 1000;

function refreshBudgetMs(): number {
  const override = Number(process.env.LEADERBOARD_REFRESH_BUDGET_MS);
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_REFRESH_BUDGET_MS;
}

/**
 * One wallet at a time. Envio's ~200 req/min budget is shared with Seer's own leaderboard job,
 * and a burst here would rate-limit both.
 */
const CONCURRENCY = 1;

/**
 * Checkpoint interval. Round 2 · L2 has 70 candidates over 213 markets and wallets there run
 * 1–2.5 minutes each, so a run spends its whole budget inside that one contest. Flushing every
 * few wallets means a kill, a crash or a redeploy costs minutes rather than the whole run —
 * and the board visibly fills in while the cursor works through it.
 */
const FLUSH_EVERY = 3;

/**
 * Give up on a contest once this many wallets in a row have produced nothing.
 *
 * High enough that a cluster of genuinely empty wallets does not trip it — a wallet with no
 * indexed activity returns null legitimately — low enough that a real outage costs seconds
 * instead of a whole lap.
 */
const ABORT_AFTER_CONSECUTIVE_FAILURES = 8;

export default async () => {
  if (process.env.DISABLE_SCHEDULED_FUNCTIONS === "true") {
    return;
  }

  const startedAt = Date.now();
  const budgetMs = refreshBudgetMs();
  const outOfBudget = () => Date.now() - startedAt > budgetMs;

  const collateral = parseCollateralProfileQueryParam(10, null);
  if ("error" in collateral) {
    throw new Error(`leaderboard: ${collateral.error}`);
  }

  // Rebuild the executor → owner map first: the contest candidate lists are expanded with it,
  // and the read endpoint needs it to merge those rows back into the owner. A few hundred
  // `eth_getCode` calls, so it costs seconds.
  let owners: OwnerMap = {};
  try {
    owners = await refreshOwnerMap(await listAllLeaderboardAddresses());
  } catch (e) {
    // Fall back to the stored map: a stale one still ranks correctly, just without the newest
    // executor. Only a total failure leaves executors unscored for this run.
    console.log("leaderboard: owner map refresh failed", e instanceof Error ? e.message : e);
    owners = await readOwnerMap().catch(() => ({}));
  }

  const cursor = await readRefreshCursor();
  let contestIndex = cursor.contestIndex;
  let walletIndex = cursor.walletIndex;
  let computedTotal = 0;

  // Walk every contest starting at the cursor, wrapping once, so a run that ran out of budget
  // last time picks up where it stopped instead of always re-doing the first contest.
  for (let visited = 0; visited < DEEP_CONTESTS.length; visited++) {
    if (outOfBudget()) break;

    const contest = DEEP_CONTESTS[contestIndex];
    const marketIds = await expandContestMarketIds(contest);
    const traders = await listContestCandidates(marketIds);
    const candidates = withExecutors(traders, owners);
    console.log(
      `[${contest.id}] ${marketIds.length} markets, ${candidates.length} wallets ` +
        `(${traders.length} traders + ${candidates.length - traders.length} executors), resuming at ${walletIndex}`,
    );

    let computed = new Map<string, Record<PortfolioPlPeriod, LeaderboardRow>>();
    let index = walletIndex < candidates.length ? walletIndex : 0;

    const flush = async () => {
      if (computed.size === 0) return;
      const existing = await readContestLeaderboard(contest.id);
      await writeContestLeaderboard(contest.id, mergeRows(existing, computed));
      console.log(`[${contest.id}] wrote ${computed.size} wallets (through ${index}/${candidates.length})`);
      computed = new Map();
      // Checkpoint the cursor with the rows, so a crash between flushes cannot replay work
      // that is already stored. A completed contest points at the next one rather than at its
      // own end — an out-of-range index restarts the contest from scratch.
      await writeRefreshCursor(
        index >= candidates.length
          ? { contestIndex: (contestIndex + 1) % DEEP_CONTESTS.length, walletIndex: 0 }
          : { contestIndex, walletIndex: index },
      );
    };

    let attempted = 0;
    let succeeded = 0;

    while (index < candidates.length && !outOfBudget()) {
      const batch = candidates.slice(index, index + CONCURRENCY);
      const results = await Promise.all(
        batch.map((address) => computeWallet(address as Address, marketIds, collateral)),
      );
      for (const result of results) {
        if (result) computed.set(result.address, result.rows);
      }
      attempted += batch.length;
      succeeded += results.filter(Boolean).length;
      index += batch.length;
      computedTotal += batch.length;
      if (computed.size >= FLUSH_EVERY) await flush();

      // Nothing is coming back. `computeWallet` swallows per-wallet errors so one bad wallet
      // cannot cost the run, but that same catch turns an outage — Envio down, a bad API host,
      // Supabase refusing us — into a silent walk through every contest, marking each one
      // complete without writing a row. Bail while the cursor still points at real work.
      if (attempted >= ABORT_AFTER_CONSECUTIVE_FAILURES && succeeded === 0) {
        console.log(
          `[${contest.id}] aborting run: ${attempted} wallets attempted, none succeeded — ` +
            "treating this as an outage rather than advancing the cursor",
        );
        await writeRefreshCursor({ contestIndex, walletIndex });
        return;
      }
    }

    await flush();

    if (index >= candidates.length) {
      // Contest finished — move on and start the next one from the top.
      contestIndex = (contestIndex + 1) % DEEP_CONTESTS.length;
      walletIndex = 0;
    } else {
      // Budget ran out mid-contest; resume here next run.
      walletIndex = index;
      break;
    }
  }

  await writeRefreshCursor({ contestIndex, walletIndex });
  console.log(
    `leaderboard refresh done: ${computedTotal} wallets in ${((Date.now() - startedAt) / 1000).toFixed(0)}s, cursor ${contestIndex}/${walletIndex}`,
  );
};

async function computeWallet(
  address: Address,
  marketIds: Address[],
  collateral: { profileName: string; primaryCollateral: Parameters<typeof computePortfolioPlAllPeriods>[0]["primaryCollateral"] },
): Promise<{ address: string; rows: Record<PortfolioPlPeriod, LeaderboardRow> } | null> {
  try {
    const computed = await computePortfolioPlAllPeriods({
      supabase,
      account: address,
      chainId: 10,
      chainIdNum: 10,
      endTime: Math.floor(Date.now() / 1000),
      marketIds,
      collateralProfile: collateral.profileName,
      primaryCollateral: collateral.primaryCollateral,
    });
    if (!computed) return null;

    // Stamped once per wallet, not once per flush: the blob's `updatedAt` says when it was last
    // written, which is not when this row was last scored. `oldestComputedAt` reads this.
    const computedAt = new Date().toISOString();

    const rows = {} as Record<PortfolioPlPeriod, LeaderboardRow>;
    for (const period of LEADERBOARD_PERIODS) {
      const snapshot = computed.byPeriod[period];
      rows[period] = {
        address,
        computedAt,
        pnl: snapshot.pnl,
        volume: snapshot.volume,
        marketCount: snapshot.marketCount,
        marketIds: snapshot.tradedMarketIds,
        valueStart: snapshot.valueStart,
        tradingCollateralNetOut: snapshot.tradingCollateralNetOut,
        roi: computeRoi({
          pnl: snapshot.pnl,
          valueStart: snapshot.valueStart,
          volume: snapshot.volume,
          tradingCollateralNetOut: snapshot.tradingCollateralNetOut,
        }),
      };
    }
    return { address, rows };
  } catch (e) {
    // One unlucky wallet must not cost the whole run; it keeps its previous row and is
    // retried on the next pass.
    console.log(`leaderboard: compute failed for ${address}`, e instanceof Error ? e.message : e);
    return null;
  }
}
