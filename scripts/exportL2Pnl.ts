/**
 * Per-participant P/L for Round 2 · L2, as CSV.
 *
 * `wallet,input,output,pnl,redeemable,netPnl` — all amounts in sUSDS, the same columns
 * `exportL1Pnl.ts` writes, so the two reports can be read side by side.
 *
 * L2 is a parent market over repositories plus one child market per repository, over that repo's
 * dependencies. What makes it simpler to account for than L1 is where the money crosses: **the
 * numeraire only ever moves at the parent gate**. Every L2 pool is `childOutcome ↔ parentOutcome`
 * (`getL2MarketBuyQuotes` / `getL2MarketSellQuotes` quote against `row.collateralToken`, the
 * carrier), so no swap leg is sUSDS and there is nothing to attribute per transaction:
 *
 *   input      sUSDS put in: minting a complete parent set (`PositionSplit` at the root)
 *   output     sUSDS taken back out: parent `PositionsMerge` + `PayoutRedemption`
 *   pnl        output − input, i.e. realised
 *   redeemable settlement value of everything the participant still holds, parent tokens and every
 *              child's outcome tokens alike — which is where all trading profit and loss lands
 *   netPnl     pnl + redeemable
 *
 * That collapses L1's two closure checks into one: `Σ minted − Σ returned − Σ redeemable` is
 * identically `−Σ netPnl`, and a zero-sum contest demands it be ~0.
 *
 * It does not quite reach 0 here, and the run says why. The L2 parent carries three sets of
 * children: the 83 "average weight" markets this contest is played on, ~102 unrelated "juror
 * weight" markets, and rows whose `marketName` is literally `"[]"`. Carrier tokens split into an
 * unresolved out-of-scope child are committed capital that settles at nothing yet, so they leave
 * the gate open by exactly that much — printed as `locked out of scope`. Everything inside the
 * contest reconciles exactly: participants' `redeemable` plus what sits in the pools equals the
 * whole outstanding wrapped supply.
 *
 * Child market ids come from Supabase — they are not in the repo — narrowed by the same name filter
 * `get-l2-markets-data.ts` and `get-redeemable.ts` use. Everything else is read from the chain, so
 * the stalled indexer that makes Supabase useless for payouts does not matter here.
 *
 *   npm run export:l2-pnl [-- <output.csv>]
 */
import {
  POSITION_SPLIT,
  POSITIONS_MERGE,
  PAYOUT_REDEMPTION,
  ZERO_BYTES32,
  addDerivedExecutors,
  addPoolLegs,
  buildReport,
  client,
  createRowStore,
  CTF,
  fetchMarkets,
  findPools,
  mapHoldersToParticipants,
  printTop,
  readHeldValue,
  readTotalSupplies,
  resolveTxInfo,
  run,
  settlementValues,
  snapshotBlock,
  sumOf,
  sumPairValue,
  warnDoubleClaims,
  writeReport,
  type MarketInfo,
} from "./lib/pnlExport";
import { CHAIN_ID, L2_PARENT_MARKET_ID, collateral } from "@/utils/constants";
import { l2MarketOutcomes } from "@/utils/l2MarketOutcomes";
import { createClient } from "@supabase/supabase-js";
import { formatUnits, type Address, type Hex } from "viem";

/**
 * The contest is played on the "average weight" children only. The same parent also carries ~102
 * unrelated "juror weight" markets and rows whose `marketName` is literally `"[]"`;
 * `get-l2-markets-data.ts` and `get-redeemable.ts` narrow the same way, and without it the set
 * triples.
 */
const IN_SCOPE_NAME = /average weight of/i;

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

/** Every child of the L2 parent, so the out-of-scope ones can be measured rather than guessed at. */
async function fetchChildren(): Promise<{ id: string; inScope: boolean }[]> {
  const { data, error } = await supabase
    .from("markets")
    .select("id,subgraph_data->>marketName")
    .eq("subgraph_data->parentMarket->>id", L2_PARENT_MARKET_ID)
    .eq("chain_id", CHAIN_ID);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; marketName: string | null }[];
  const byId = new Map<string, boolean>();
  for (const row of rows) {
    byId.set(row.id.toLowerCase(), IN_SCOPE_NAME.test(row.marketName ?? ""));
  }
  if (![...byId.values()].some(Boolean)) {
    throw new Error(`no L2 child market matched ${IN_SCOPE_NAME} — has the naming drifted?`);
  }
  // Sorted so two runs build the same token order, and a diff of two CSVs is a diff of the data.
  return [...byId.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, inScope]) => ({ id, inScope }));
}

/**
 * Carrier value committed to children this report does not score.
 *
 * A carrier split into a child market is burned; what comes back is that child's outcome tokens, so
 * while the child is unresolved the capital settles at nothing and the gate stays open by that
 * much. An unresolved child's outcome tokens are minted and burned as complete sets, so the number
 * of sets outstanding — and with it the carriers locked up — is the supply of any one of them.
 *
 * Deduplicated by `conditionId`: several of the juror-weight rows are the same question deployed
 * twice and share their wrapped tokens, which would otherwise be counted once per market id.
 */
async function lockedOutOfScope(
  children: readonly MarketInfo[],
  parentRatios: readonly number[],
  toBlock: bigint,
): Promise<number> {
  const byCondition = new Map<Hex, MarketInfo>();
  for (const child of children) {
    if ((parentRatios[Number(child.parentOutcome)] ?? 0) > 0) byCondition.set(child.conditionId, child);
  }
  const markets = [...byCondition.values()];
  if (markets.length === 0) return 0;

  const supplies = await readTotalSupplies(
    markets.flatMap((market) => market.wrappedTokens.map((token) => token.toLowerCase())),
    toBlock,
  );
  let offset = 0;
  let locked = 0;
  for (const market of markets) {
    const own = supplies.slice(offset, offset + market.wrappedTokens.length);
    offset += market.wrappedTokens.length;
    const sets = own.reduce((most, supply) => (supply > most ? supply : most), 0n);
    locked +=
      Number(formatUnits(sets, collateral.decimals)) * parentRatios[Number(market.parentOutcome)];
  }
  return locked;
}

async function main() {
  const outPath = process.argv[2] ?? "scripts/out/l2-participants.csv";
  const toBlock = await snapshotBlock();

  // ── markets ────────────────────────────────────────────────────────────────────────────────
  const childRows = await fetchChildren();
  const [parent, ...allChildren] = await fetchMarkets([
    L2_PARENT_MARKET_ID,
    ...childRows.map((row) => row.id),
  ]);
  const inScope = new Set(childRows.filter((row) => row.inScope).map((row) => row.id));
  const children = allChildren.filter((child) => inScope.has(child.id.toLowerCase()));
  const outOfScope = allChildren.filter((child) => !inScope.has(child.id.toLowerCase()));

  const parentTokens = parent.wrappedTokens.map((token) => token.toLowerCase());
  const childTokens = children.flatMap((child) =>
    child.wrappedTokens.map((token) => token.toLowerCase()),
  );

  const { valueByToken, parentRatios } = await settlementValues(parent, children);

  console.log(
    `parent ${parent.id} (${parentTokens.length} outcomes, ` +
      `${parentRatios.filter((value) => value > 0).length} paying) · ${children.length} children ` +
      `(${childTokens.length} outcomes) · ${outOfScope.length} children out of scope`,
  );

  // A market that never reported payouts prices its tokens at 0. That is only a problem when those
  // tokens could have been worth something — a child under a losing parent outcome settles at 0
  // either way, and most of the out-of-scope children are exactly that.
  const unreported = [parent, ...children].filter(
    (market) =>
      !market.payoutReported &&
      (market.id === parent.id || (parentRatios[Number(market.parentOutcome)] ?? 0) > 0),
  );
  if (unreported.length > 0) {
    console.warn(
      `warning: ${unreported.length} market(s) that could carry value have not reported payouts — ` +
        `their tokens price at 0: ${unreported.map((market) => market.id).join(", ")}`,
    );
  }

  // The parent's outcome tokens are hardcoded in the app. If they no longer line up, this run is
  // scoring a different market than the UI trades. (`l2OutcomeTokens`, the app's child-token list,
  // is deliberately *not* checked here: it holds the juror-weight children's tokens and shares
  // nothing with the "average weight" markets this contest is played on.)
  const appParentTokens = new Set(l2MarketOutcomes.map((token) => token.toLowerCase()));
  const parentMismatch = parentTokens.filter((token) => !appParentTokens.has(token));
  if (parentMismatch.length > 0 || parentTokens.length !== appParentTokens.size) {
    console.warn(
      `warning: parent has ${parentTokens.length} outcome tokens, the app trades ` +
        `${appParentTokens.size}, ${parentMismatch.length} of them unknown to the app`,
    );
  }

  // ── conditional-token flows ────────────────────────────────────────────────────────────────
  const ourConditions = new Set<Hex>([
    parent.conditionId,
    ...children.map((child) => child.conditionId),
  ]);
  const isOurs = (log: { args: { conditionId?: Hex } }) =>
    !!log.args.conditionId && ourConditions.has(log.args.conditionId);
  /** Only the root level moves sUSDS; a child split/merge/redeem moves a carrier token. */
  const isCollateralGate = (log: { args: { conditionId?: Hex; parentCollectionId?: Hex } }) =>
    log.args.conditionId === parent.conditionId && log.args.parentCollectionId === ZERO_BYTES32;

  const [splits, merges, redemptions] = await Promise.all([
    client.getLogs({ address: CTF, event: POSITION_SPLIT, fromBlock: 0n, toBlock }),
    client.getLogs({ address: CTF, event: POSITIONS_MERGE, fromBlock: 0n, toBlock }),
    // `conditionId` is not indexed on redemption, so this filters on the collateral instead: sUSDS
    // for the parent, and every parent outcome token for the children. The child rows carry no
    // sUSDS, but they name wallets the parent rows might not.
    client.getLogs({
      address: CTF,
      event: PAYOUT_REDEMPTION,
      args: { collateralToken: [collateral.address, ...parentTokens] as Address[] },
      fromBlock: 0n,
      toBlock,
    }),
  ]);

  const events = [
    ...splits.filter(isOurs).map((log) => ({ log, kind: "split" as const, amount: log.args.amount! })),
    ...merges.filter(isOurs).map((log) => ({ log, kind: "merge" as const, amount: log.args.amount! })),
    ...redemptions
      .filter(isOurs)
      .map((log) => ({ log, kind: "redeem" as const, amount: log.args.payout! })),
  ];

  const countOf = (kind: string) => events.filter((event) => event.kind === kind).length;
  console.log(
    `events: ${countOf("split")} splits, ${countOf("merge")} merges, ${countOf("redeem")} redemptions`,
  );

  // ── holders ────────────────────────────────────────────────────────────────────────────────
  const ourTokens = new Set([...parentTokens, ...childTokens]);
  const hashes = [...new Set(events.map((event) => event.log.transactionHash!))];
  // A higher concurrency than L1's: this contest has an order of magnitude more transactions to
  // walk, and each one is two RPC round trips.
  const txInfo = await resolveTxInfo(hashes, ourTokens, 16);
  const participantOf = await mapHoldersToParticipants(txInfo);

  // ── aggregate ──────────────────────────────────────────────────────────────────────────────
  const { rows, rowFor } = createRowStore();

  let unattributed = 0n;
  for (const event of events) {
    const info = txInfo.get(event.log.transactionHash!.toLowerCase());
    const holder = info?.holder || info?.to || info?.from;
    if (!holder) {
      unattributed += event.amount;
      continue;
    }
    const participant = participantOf.get(holder) ?? holder;
    const row = rowFor(participant);
    row.wallets.add(holder);
    if (!isCollateralGate(event.log)) continue;
    if (event.kind === "split") row.split += event.amount;
    else row.mergedAndRedeemed += event.amount;
  }

  await addDerivedExecutors(rows);

  // ── open positions ─────────────────────────────────────────────────────────────────────────
  // Only tokens that settled above zero are read. That is exact — a token worth 0 adds 0 whatever
  // the balance — and it is the difference between a few hundred balance calls per wallet and
  // nearly four thousand.
  const valuableTokens = [...ourTokens].filter((token) => (valueByToken.get(token) ?? 0) > 0);
  const allWallets = [...new Set([...rows.values()].flatMap((row) => [...row.wallets]))];
  const heldValue = await readHeldValue(allWallets, valuableTokens, valueByToken, toBlock);

  // ── pools ──────────────────────────────────────────────────────────────────────────────────
  const pools = await findPools([parent, ...children], toBlock, { required: false });

  // Trading is carrier-denominated, so this is expected to find nothing and the pool columns to
  // stay 0 — but "expected" is not "checked". If anyone ever opened a pool that pays in sUSDS, its
  // flow belongs in `input`/`output` exactly as it does on L1.
  const cashPools = pools.filter((pool) =>
    pool.tokens.some((token) => token === collateral.address.toLowerCase()),
  );
  let unmatchedIn = 0;
  let unmatchedOut = 0;
  if (cashPools.length > 0) {
    console.log(`${cashPools.length} pools pay in ${collateral.symbol} — counting their legs`);
    ({ unmatchedIn, unmatchedOut } = await addPoolLegs(rows, {
      pools: new Set(cashPools.map((pool) => pool.id)),
      tokens: [
        ...new Set(cashPools.flatMap((pool) => pool.tokens).filter((token) => ourTokens.has(token))),
      ],
      toBlock,
    }));
  }

  // Liquidity never withdrawn is settlement value that belongs to an LP but sits in no wallet.
  const strandedInPools = await sumPairValue(
    pools.flatMap((pool) =>
      pool.tokens
        .filter((token) => (valueByToken.get(token) ?? 0) > 0)
        .map((token) => ({ holder: pool.id, token })),
    ),
    valueByToken,
    toBlock,
  );

  const locked = await lockedOutOfScope(outOfScope, parentRatios, toBlock);

  warnDoubleClaims(rows);

  // ── csv ────────────────────────────────────────────────────────────────────────────────────
  const report = buildReport(rows, heldValue);
  writeReport(outPath, report);

  // One closure, and it is the zero-sum check: every sUSDS minted is merged, redeemed or still
  // redeemable. What is left over is capital that has left the contest without settling — carriers
  // locked in an unresolved out-of-scope child, and liquidity still sitting in the pools.
  const gate =
    sumOf(report, (row) => row.minted) -
    sumOf(report, (row) => row.returned) -
    sumOf(report, (row) => row.redeemable);
  console.log(
    `gate closes to ${gate.toFixed(2)} · locked out of scope ${locked.toFixed(2)} · ` +
      `stranded in pools ${strandedInPools.toFixed(2)} · unexplained ` +
      `${(gate - locked - strandedInPools).toFixed(2)}` +
      (cashPools.length > 0
        ? ` · pools close to ${(
            sumOf(report, (row) => row.paidToPools) +
            unmatchedIn -
            sumOf(report, (row) => row.tookFromPools) -
            unmatchedOut
          ).toFixed(2)}`
        : ""),
  );
  if (unattributed > 0n) {
    console.log(
      `unattributed flow: ${Number(formatUnits(unattributed, collateral.decimals)).toFixed(2)}`,
    );
  }

  printTop(report);
}

run(main);
