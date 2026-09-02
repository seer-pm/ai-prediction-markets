import {
  AI_PREDICTION_MARKET_ID,
  CHAIN_ID,
  L1_MARKET_ID,
  L2_PARENT_MARKET_ID,
  OCTANT_MARKET_ID,
  ORIGINALITY_PARENT_MARKET_ID,
  OTHER_MARKET_ID,
} from "@/utils/constants";
import { ZCASH_MARKET_IDS } from "@/utils/zcashMarkets";
import { MarketStatus } from "@seer-pm/sdk";
import { createClient } from "@supabase/supabase-js";
import { erc20Abi, type Address } from "viem";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { EXECUTOR_BYTECODES, mapPool, predictExecutorAddress } from "./utils/executorAddress";
import { getMarketStatus, type MarketStatusInput } from "./utils/marketStatus";
import { fetchMarketsOnChain, publicClient } from "./utils/marketView";

/**
 * "Does this participant still have anything to claim, anywhere?" — `?account=<EOA>`.
 *
 * The app has no cross-contest view of a wallet: every tab reads its own market list and its own
 * balances, and `Tab.tsx` mounts a tab only once you have clicked it. So a settled claim in a
 * contest you never opened is invisible. This answers that question for the whole registry at
 * once, for both of the participant's trade executors.
 *
 * Deliberately a **boolean per contest**, not an amount. What a claim is worth is already computed
 * and shown by each contest's redeem dialog, where the payout chain — a child position settles
 * against its parent's carrier outcome, not against sUSDS — is already handled. Repeating that
 * math here would be a second place to get it wrong, for a number the board does not display.
 *
 * Deliberately not edge-cached, like `get-profiles`: the answer is per-wallet and goes stale the
 * moment its owner redeems. The client caches it in React Query instead.
 */

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

/**
 * One eth_call per chunk. 500 measured fastest against our RPC; the browser's `readContractsInBatch`
 * uses 50 with a sleep between chunks because it shares a rate limit with the whole app, which is a
 * constraint this function does not have.
 */
const BALANCE_CHUNK = 500;
const BALANCE_CONCURRENCY = 6;

/**
 * How long a resolved market set is reused across requests on a warm instance.
 *
 * Which markets have settled changes when a contest resolves — a handful of times a year — while
 * the Supabase reads and the MarketView multicall behind it are most of this function's latency.
 * Balances are never cached here; only the question of which tokens are worth asking about.
 */
const MARKET_SET_TTL_MS = 5 * 60 * 1000;

interface SupabaseMarketRow extends MarketStatusInput {
  wrappedTokens: Address[];
}

/** Outcome tokens whose market has settled — the only ones a positive balance means anything for. */
type ClosedTokens = Address[];

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function closedTokensFromRows(rows: SupabaseMarketRow[] | null): ClosedTokens {
  return (rows ?? [])
    .filter((row) => getMarketStatus(row) === MarketStatus.CLOSED)
    .flatMap((row) => row.wrappedTokens ?? []);
}

const MARKET_COLUMNS =
  "subgraph_data->wrappedTokens,subgraph_data->payoutReported,subgraph_data->questions";

async function selectMarket(id: string): Promise<ClosedTokens> {
  const { data, error } = await supabase
    .from("markets")
    .select(MARKET_COLUMNS)
    .eq("id", id)
    .eq("chain_id", CHAIN_ID)
    .single();
  if (error) throw error;
  return closedTokensFromRows(data ? [data as unknown as SupabaseMarketRow] : null);
}

async function selectChildren(parentId: string, nameFilter?: string): Promise<ClosedTokens> {
  let query = supabase
    .from("markets")
    .select(MARKET_COLUMNS)
    .eq("subgraph_data->parentMarket->>id", parentId)
    .eq("chain_id", CHAIN_ID);
  // The L2 parent also carries unrelated "juror weight" children and rows whose marketName is
  // literally "[]". `get-l2-markets-data` narrows the same way; without it the set triples.
  if (nameFilter) query = query.ilike("subgraph_data->>marketName", nameFilter);
  const { data, error } = await query;
  if (error) throw error;
  return closedTokensFromRows(data as unknown as SupabaseMarketRow[] | null);
}

/**
 * Settled outcome tokens per contest, keyed by the ids in `@/utils/contests`.
 *
 * Each contest reads from the source its own data function uses, for the reasons documented there:
 * L1 and Zcash go through MarketView because Seer's Optimism indexer stalled — L1 markets still
 * report `payoutReported: false` days after resolving — and because the 37 Zcash markets are not in
 * Supabase at all. See `./marketView`.
 */
async function fetchClosedTokensByContest(): Promise<Record<string, ClosedTokens>> {
  const [round1, octant, originalityParent, originalityChildren, l2Parent, l2Children, onChain] =
    await Promise.all([
      selectMarket(AI_PREDICTION_MARKET_ID),
      selectMarket(OCTANT_MARKET_ID),
      selectMarket(ORIGINALITY_PARENT_MARKET_ID),
      selectChildren(ORIGINALITY_PARENT_MARKET_ID),
      selectMarket(L2_PARENT_MARKET_ID),
      selectChildren(L2_PARENT_MARKET_ID, "%What will be the average weight of%"),
      fetchMarketsOnChain([L1_MARKET_ID, OTHER_MARKET_ID, ...ZCASH_MARKET_IDS] as Address[]),
    ]);

  const closedOnChain = onChain.filter((market) => market.marketStatus === MarketStatus.CLOSED);
  const tokensOf = (ids: readonly string[]) =>
    closedOnChain
      .filter((market) => ids.some((id) => id.toLowerCase() === market.id.toLowerCase()))
      .flatMap((market) => market.wrappedTokens);

  return {
    round1,
    octant,
    round2: [...originalityParent, ...originalityChildren],
    "round2-l2": [...l2Parent, ...l2Children],
    "round2-l1": tokensOf([L1_MARKET_ID, OTHER_MARKET_ID]),
    zcash: tokensOf(ZCASH_MARKET_IDS),
  };
}

/**
 * Whether `account` holds any of `tokens`, stopping at the first hit.
 *
 * The chunks run in sequence rather than concurrently on purpose: the answer is a boolean, so a
 * wallet that holds something usually settles in the first chunk and the rest are never sent. The
 * concurrency budget is spent across contests instead, where it cannot be wasted.
 */
async function holdsAny(account: Address, tokens: ClosedTokens): Promise<boolean> {
  for (let index = 0; index < tokens.length; index += BALANCE_CHUNK) {
    const balances = await publicClient.multicall({
      contracts: tokens.slice(index, index + BALANCE_CHUNK).map((token) => ({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [account],
      })),
      allowFailure: false,
    });
    if (balances.some((balance) => balance > 0n)) return true;
  }
  return false;
}

/**
 * The participant's deployed trade executors, current generation first.
 *
 * Derived here rather than passed in: the client's own `tradeExecutor` silently points at the
 * deprecated contract whenever the `isUseOldWallet` flag is on, so asking it for "both" invites
 * exactly one bug. The predicted address also exists whether or not the contract does, which the
 * client-side check cannot say (`checkContractCreated` returns no address on a miss).
 */
async function deployedExecutors(account: Address): Promise<Address[]> {
  const predicted = EXECUTOR_BYTECODES.map((bytecode) => predictExecutorAddress(account, bytecode));
  const codes = await Promise.all(
    predicted.map(async (address) => {
      try {
        return (await publicClient.getCode({ address })) ?? "0x";
      } catch {
        return "0x";
      }
    }),
  );
  return predicted.filter((_, index) => codes[index] !== "0x");
}

let marketSetCache: { at: number; value: Promise<Record<string, ClosedTokens>> } | undefined;

function closedTokensByContest(): Promise<Record<string, ClosedTokens>> {
  if (!marketSetCache || Date.now() - marketSetCache.at > MARKET_SET_TTL_MS) {
    const value = fetchClosedTokensByContest();
    // Drop a rejected lookup so the next request retries rather than serving the failure for
    // the rest of the TTL.
    value.catch(() => {
      if (marketSetCache?.value === value) marketSetCache = undefined;
    });
    marketSetCache = { at: Date.now(), value };
  }
  return marketSetCache.value;
}

export default async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const account = (new URL(req.url).searchParams.get("account") ?? "").trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(account)) {
      return jsonResponse({ error: "account must be a 0x-prefixed address" }, 400, corsHeaders);
    }

    const [executors, tokensByContest] = await Promise.all([
      deployedExecutors(account as Address),
      closedTokensByContest(),
    ]);

    // One unit of work per (wallet, contest), so a slow contest never gates a fast one.
    const jobs = executors.flatMap((executor) =>
      Object.entries(tokensByContest).map(([contestId, tokens]) => ({
        executor,
        contestId,
        tokens,
      })),
    );
    const hits = await mapPool(
      jobs,
      BALANCE_CONCURRENCY,
      async (job) => job.tokens.length > 0 && (await holdsAny(job.executor, job.tokens)),
    );

    const wallets: Record<string, Record<string, boolean>> = {};
    for (const executor of executors) wallets[executor.toLowerCase()] = {};
    jobs.forEach((job, index) => {
      wallets[job.executor.toLowerCase()][job.contestId] = hits[index];
    });

    return jsonResponse(
      {
        checkedAt: Math.floor(Date.now() / 1000),
        wallets,
        // In bytecode order, so the client can name them without re-deriving: current, then
        // deprecated. Either may be absent when that generation was never deployed.
        executors: executors.map((executor) => executor.toLowerCase()),
      },
      200,
      corsHeaders,
    );
  } catch (e) {
    console.log(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
};
