/**
 * The machinery behind the per-contest P/L exports (`exportL1Pnl.ts`, `exportL2Pnl.ts`).
 *
 * Everything here is contest-agnostic: reading markets and their settlement ratios, working out
 * which participant is behind a Router transaction, valuing what is still held, and writing the
 * CSV. What differs between contests — how many children there are, where the collateral gate sits,
 * whether any pool pays in the primary collateral — stays in the scripts.
 *
 * Every read goes to the chain. Seer's indexer stalled on Optimism at block 156,195,946
 * (2026-08-29) and so never saw the 2026-08-31 resolutions or any redemption after them, which
 * rules out `ConditionalEvent` / `pnl_leaderboard` as sources — see
 * `netlify/functions/utils/marketView.ts`.
 */
import { MarketViewAbi } from "@/abis/MarketViewAbi";
import { OPTIMISM_RPC } from "@/config/rpc";
import { CHAIN_ID, CONDITIONAL_TOKENS, ROUTER_ADDRESSES, collateral } from "@/utils/constants";
import {
  EXECUTOR_BYTECODES,
  mapPool,
  predictExecutorAddress,
} from "../../netlify/functions/utils/executorAddress";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  parseAbiItem,
  toEventSelector,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { optimism } from "viem/chains";

/** MarketView and a market factory, both on Optimism — see `netlify/functions/utils/marketView.ts` */
const MARKET_VIEW = "0x336695ec9efbafd6322fb82eaadbcda02e38f348" as const;
const MARKET_FACTORY = "0x886Ef0A78faBbAE942F1dA1791A8ed02a5aF8BC6" as const;

export const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;
export const ROUTER = ROUTER_ADDRESSES[CHAIN_ID].toLowerCase();
export const CTF = CONDITIONAL_TOKENS[CHAIN_ID];

export const client = createPublicClient({
  chain: optimism,
  transport: http(OPTIMISM_RPC, { batch: true }),
});

/**
 * Gnosis ConditionalTokens. `conditionId` is indexed on split/merge but *not* on redemption, so a
 * redemption is filtered on the indexed `collateralToken` and matched on the decoded id.
 */
export const POSITION_SPLIT = parseAbiItem(
  "event PositionSplit(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)",
);
export const POSITIONS_MERGE = parseAbiItem(
  "event PositionsMerge(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)",
);
export const PAYOUT_REDEMPTION = parseAbiItem(
  "event PayoutRedemption(address indexed redeemer, address indexed collateralToken, bytes32 indexed parentCollectionId, bytes32 conditionId, uint256[] indexSets, uint256 payout)",
);

export const ERC20_TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const PAYOUT_DENOMINATOR_ABI = [
  {
    inputs: [{ type: "bytes32" }],
    name: "payoutDenominator",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const OWNER_ABI = [
  {
    inputs: [],
    name: "owner",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const TRANSFER_TOPIC = toEventSelector(ERC20_TRANSFER);

/** `0xef0100 || address` — an EIP-7702 delegation. The account is still the participant's own EOA. */
const EIP_7702_PREFIX = "0xef0100";

export { mapPool };

/**
 * dRPC load-balances, and the nodes behind it do not all sit at the same height: a receipt for a
 * block this run has already read logs from can still be missing from whichever node answers.
 * Retrying lands on another one.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

/**
 * A block a little behind the head, to pin every read of a run to.
 *
 * These contests are still live — people are redeeming as this runs — and an unpinned run mixes a
 * log from the newest block with a balance read after it, or asks a load-balanced node for a
 * receipt it has not seen yet.
 *
 * `PNL_TO_BLOCK=<n>` pins it explicitly, which is how two runs of a report are compared: without it
 * the chain moves underneath them and every difference has to be argued about.
 */
export async function snapshotBlock(): Promise<bigint> {
  const toBlock = process.env.PNL_TO_BLOCK
    ? BigInt(process.env.PNL_TO_BLOCK)
    : (await client.getBlockNumber()) - 20n;
  console.log(`snapshot at block ${toBlock}`);
  return toBlock;
}

// ── markets ──────────────────────────────────────────────────────────────────────────────────

/** Chunked because a child-heavy contest asks for a hundred of these structs at once. */
const MARKET_CHUNK = 40;

export async function fetchMarkets(ids: readonly string[]) {
  const markets = [];
  for (let index = 0; index < ids.length; index += MARKET_CHUNK) {
    const chunk = await client.multicall({
      contracts: ids.slice(index, index + MARKET_CHUNK).map((id) => ({
        address: MARKET_VIEW as Address,
        abi: MarketViewAbi,
        functionName: "getMarket" as const,
        args: [MARKET_FACTORY as Address, id as Address],
      })),
      allowFailure: false,
    });
    markets.push(...chunk);
  }
  return markets;
}

export type MarketInfo = Awaited<ReturnType<typeof fetchMarkets>>[number];

export interface SettlementValues {
  /** Token address (lowercase) → sUSDS a whole unit of it settles at. */
  valueByToken: Map<string, number>;
  parentRatios: number[];
  /** Per child, in `children` order. */
  childRatios: number[][];
}

/**
 * What a whole unit of every outcome token is worth in the primary collateral once settled.
 *
 * A parent token is worth `numerator / denominator` sUSDS. A child token is collateralised by the
 * parent's outcome-`parentOutcome` token, so its value chains through that ratio.
 */
export async function settlementValues(
  parent: MarketInfo,
  children: readonly MarketInfo[],
): Promise<SettlementValues> {
  const markets = [parent, ...children];
  const denominators: bigint[] = [];
  for (let index = 0; index < markets.length; index += MARKET_CHUNK) {
    const chunk = await client.multicall({
      contracts: markets.slice(index, index + MARKET_CHUNK).map((market) => ({
        address: CTF as Address,
        abi: PAYOUT_DENOMINATOR_ABI,
        functionName: "payoutDenominator" as const,
        args: [market.conditionId],
      })),
      allowFailure: false,
    });
    denominators.push(...(chunk as bigint[]));
  }

  const ratio = (numerator: bigint, denominator: bigint) =>
    denominator === 0n ? 0 : Number(numerator) / Number(denominator);

  const valueByToken = new Map<string, number>();
  const parentRatios = parent.payoutNumerators.map((numerator) => ratio(numerator, denominators[0]));
  parent.wrappedTokens.forEach((token, index) =>
    valueByToken.set(token.toLowerCase(), parentRatios[index]),
  );

  const childRatios = children.map((child, childIndex) => {
    const carrierRatio = parentRatios[Number(child.parentOutcome)] ?? 0;
    const ratios = child.payoutNumerators.map(
      (numerator) => ratio(numerator, denominators[childIndex + 1]) * carrierRatio,
    );
    child.wrappedTokens.forEach((token, index) =>
      valueByToken.set(token.toLowerCase(), ratios[index]),
    );
    return ratios;
  });

  return { valueByToken, parentRatios, childRatios };
}

// ── holders ──────────────────────────────────────────────────────────────────────────────────

export interface TxInfo {
  holder: string | null;
  from: string;
  to: string;
}

/**
 * Who was on the other side of the Router in each of these transactions.
 *
 * The CTF `stakeholder`/`redeemer` is always the Router, so it says nothing about who acted. The
 * holder is the Router's counterparty in the wrapped-token transfers of the same transaction:
 * `splitFromRouter` mints to the Router and forwards to its caller, a merge or redeem pulls from
 * it. That stays exact when the caller is not `tx.to` — a participant driving several bot contracts
 * from a single EOA lands the positions in a contract other than the one the transaction was sent
 * to.
 */
export async function resolveTxInfo(
  hashes: readonly Hex[],
  ourTokens: Set<string>,
  concurrency = 8,
): Promise<Map<string, TxInfo>> {
  console.log(`resolving holders across ${hashes.length} transactions…`);
  const txInfo = new Map<string, TxInfo>();
  await mapPool([...hashes], concurrency, async (hash) => {
    const [tx, receipt] = await Promise.all([
      withRetry(() => client.getTransaction({ hash })),
      withRetry(() => client.getTransactionReceipt({ hash })),
    ]);
    const counts = new Map<string, number>();
    for (const log of receipt.logs) {
      if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
      if (!ourTokens.has(log.address.toLowerCase())) continue;
      const from = `0x${log.topics[1]!.slice(26)}`.toLowerCase();
      const to = `0x${log.topics[2]!.slice(26)}`.toLowerCase();
      const counterparty = from === ROUTER ? to : to === ROUTER ? from : null;
      if (!counterparty || counterparty === zeroAddress || counterparty === ROUTER) continue;
      counts.set(counterparty, (counts.get(counterparty) ?? 0) + 1);
    }
    const holder = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    txInfo.set(hash.toLowerCase(), {
      holder,
      from: tx.from.toLowerCase(),
      to: (tx.to ?? "").toLowerCase(),
    });
  });
  return txInfo;
}

/**
 * Which EOA to report each holding address under.
 *
 * A trade executor answers `owner()`; that is the EOA. Anything else holding positions — a
 * participant's own bot contract — has no owner to ask, so it falls back to the EOA that sends its
 * transactions. `tx.from` is *not* usable on an executor: this app drives executors with disposable
 * browser session keys (`sessionKey.ts`), so one participant's transactions arrive from many
 * one-off addresses.
 */
export async function mapHoldersToParticipants(
  txInfo: Map<string, TxInfo>,
): Promise<Map<string, string>> {
  const holders = [
    ...new Set(
      [...txInfo.values()].map((tx) => tx.holder).filter((holder): holder is string => !!holder),
    ),
  ];
  const ownerResults = await client.multicall({
    allowFailure: true,
    contracts: holders.map((address) => ({
      address: address as Address,
      abi: OWNER_ABI,
      functionName: "owner" as const,
    })),
  });
  const codes = await mapPool(holders, 10, (address) =>
    client.getCode({ address: address as Address }).catch(() => undefined),
  );

  const sendersByHolder = new Map<string, Map<string, number>>();
  for (const { holder, from } of txInfo.values()) {
    if (!holder) continue;
    const senders = sendersByHolder.get(holder) ?? new Map<string, number>();
    senders.set(from, (senders.get(from) ?? 0) + 1);
    sendersByHolder.set(holder, senders);
  }

  const participantOf = new Map<string, string>();
  holders.forEach((holder, index) => {
    const result = ownerResults[index];
    const owner =
      result.status === "success" && result.result && result.result !== zeroAddress
        ? (result.result as string).toLowerCase()
        : null;
    if (owner && owner !== holder) {
      participantOf.set(holder, owner);
      return;
    }
    const code = codes[index] ?? "0x";
    const isContract = code !== "0x" && !code.toLowerCase().startsWith(EIP_7702_PREFIX);
    if (!isContract) {
      participantOf.set(holder, holder);
      return;
    }
    const senders = [...(sendersByHolder.get(holder) ?? new Map<string, number>()).entries()].sort(
      (a, b) => b[1] - a[1],
    );
    participantOf.set(holder, senders[0]?.[0] ?? holder);
  });
  return participantOf;
}

// ── rows ─────────────────────────────────────────────────────────────────────────────────────

export interface ParticipantRow {
  /** Primary collateral through the Router, in wei — exact, so it is kept apart from swap legs. */
  split: bigint;
  mergedAndRedeemed: bigint;
  /** Primary collateral paid to / received from the pools — trading and liquidity alike. */
  paidToPools: number;
  tookFromPools: number;
  wallets: Set<string>;
}

export function createRowStore() {
  const rows = new Map<string, ParticipantRow>();
  const rowFor = (participant: string) => {
    let row = rows.get(participant);
    if (!row) {
      row = {
        split: 0n,
        mergedAndRedeemed: 0n,
        paidToPools: 0,
        tookFromPools: 0,
        wallets: new Set([participant]),
      };
      rows.set(participant, row);
    }
    return row;
  };
  return { rows, rowFor };
}

/**
 * Executors that were deployed but never touched by a transaction this run walked can still hold
 * positions — the indexer-blind case `executorOwners.ts` documents. Derive and include them.
 */
export async function addDerivedExecutors(rows: Map<string, ParticipantRow>): Promise<void> {
  const derived: { participant: string; executor: string }[] = [];
  for (const [participant, row] of rows) {
    for (const bytecode of EXECUTOR_BYTECODES) {
      // `predictExecutorAddress` answers in checksum case; every address in `wallets` is lowercase.
      const executor = predictExecutorAddress(participant as Address, bytecode).toLowerCase();
      if (executor !== participant && !row.wallets.has(executor)) {
        derived.push({ participant, executor });
      }
    }
  }
  const codes = await mapPool(derived, 10, ({ executor }) =>
    client.getCode({ address: executor as Address }).catch(() => undefined),
  );
  derived.forEach(({ participant, executor }, index) => {
    const code = codes[index];
    if (code && code !== "0x") rows.get(participant)!.wallets.add(executor);
  });
}

/** No wallet may be claimed by two participants, or its balance is counted twice. */
export function warnDoubleClaims(rows: Map<string, ParticipantRow>): void {
  const claimedBy = new Map<string, string>();
  for (const [participant, row] of rows) {
    for (const held of row.wallets) {
      const owner = claimedBy.get(held);
      if (owner && owner !== participant) {
        console.warn(`warning: ${held} is claimed by both ${owner} and ${participant}`);
      }
      claimedBy.set(held, participant);
    }
  }
}

// ── open positions ───────────────────────────────────────────────────────────────────────────

const BALANCE_BATCH = 500;

/** Settlement value of everything each address still holds, at `toBlock`. */
export async function readHeldValue(
  addresses: readonly string[],
  tokens: readonly string[],
  valueByToken: Map<string, number>,
  toBlock: bigint,
): Promise<Map<string, number>> {
  console.log(`reading ${tokens.length} balances × ${addresses.length} addresses…`);
  const calls = addresses.flatMap((address) =>
    tokens.map((token) => ({
      address: token as Address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address as Address],
    })),
  );
  const balances: bigint[] = [];
  for (let index = 0; index < calls.length; index += BALANCE_BATCH) {
    const chunk = await client.multicall({
      contracts: calls.slice(index, index + BALANCE_BATCH),
      allowFailure: false,
      blockNumber: toBlock,
    });
    balances.push(...(chunk as bigint[]));
  }

  const valueByAddress = new Map<string, number>();
  addresses.forEach((address, addressIndex) => {
    let value = 0;
    tokens.forEach((token, tokenIndex) => {
      const balance = balances[addressIndex * tokens.length + tokenIndex];
      if (balance === 0n) return;
      value += Number(formatUnits(balance, collateral.decimals)) * (valueByToken.get(token) ?? 0);
    });
    valueByAddress.set(address, value);
  });
  return valueByAddress;
}

/** `totalSupply` of each token, at `toBlock`, in the order given. */
export async function readTotalSupplies(
  tokens: readonly string[],
  toBlock: bigint,
): Promise<bigint[]> {
  const supplies: bigint[] = [];
  for (let index = 0; index < tokens.length; index += BALANCE_BATCH) {
    const chunk = await client.multicall({
      contracts: tokens.slice(index, index + BALANCE_BATCH).map((token) => ({
        address: token as Address,
        abi: erc20Abi,
        functionName: "totalSupply" as const,
      })),
      allowFailure: false,
      blockNumber: toBlock,
    });
    supplies.push(...(chunk as bigint[]));
  }
  return supplies;
}

/**
 * Settlement value summed over explicit (holder, token) pairs.
 *
 * `readHeldValue` reads every token for every address; this reads only the pairs asked for, which
 * is what a sweep of pool contracts needs — a pool holds two tokens, not the contest's several
 * thousand.
 */
export async function sumPairValue(
  pairs: readonly { holder: string; token: string }[],
  valueByToken: Map<string, number>,
  toBlock: bigint,
): Promise<number> {
  let total = 0;
  for (let index = 0; index < pairs.length; index += BALANCE_BATCH) {
    const slice = pairs.slice(index, index + BALANCE_BATCH);
    const balances = await client.multicall({
      contracts: slice.map(({ holder, token }) => ({
        address: token as Address,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [holder as Address],
      })),
      allowFailure: false,
      blockNumber: toBlock,
    });
    (balances as bigint[]).forEach((balance, offset) => {
      if (balance === 0n) return;
      total +=
        Number(formatUnits(balance, collateral.decimals)) *
        (valueByToken.get(slice[offset].token) ?? 0);
    });
  }
  return total;
}

// ── pools ────────────────────────────────────────────────────────────────────────────────────

/**
 * Uniswap V3 on Optimism, and every fee tier a pool for these tokens could have been opened at.
 */
const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984" as const;
const FEE_TIERS = [100, 500, 3000, 10000] as const;
const FACTORY_ABI = [
  {
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    name: "getPool",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
const POOL_CALL_BATCH = 500;

export interface Pool {
  id: string;
  /** The pair the pool was found under, lowercase. */
  tokens: [string, string];
}

/**
 * Every Uniswap pool holding one of these markets' outcome tokens — the venue for the sells and
 * buys the trade strategy places around a mint, and the venue its liquidity sits in.
 *
 * Asked of the factory, one `getPool` per (pair, fee tier), rather than of the Uniswap subgraph.
 * The Graph's gateway load-balances across indexers whose answers to the same pinned-block query
 * disagree: the same L1 run came back with 98 pools as readily as 100, moving ~2 sUSDS of pool flow
 * between runs of this report with both closure checks still passing. `getPool` is a chain read, so
 * it answers the same thing every time, and it cannot miss a pool that exists for a pair.
 *
 * The pairs are the ones these markets can actually be traded through: every outcome token against
 * its own market's collateral, plus — for a nested market, whose collateral is a parent outcome
 * token — that token against the primary collateral, in case anyone opened one.
 *
 * `required` refuses a run that found none: silently reporting mint-only numbers as if they were
 * the whole story is the one outcome worth refusing, on a contest that trades against the primary
 * collateral. A contest whose pools never hold it passes `false`.
 */
export async function findPools(
  markets: readonly MarketInfo[],
  toBlock: bigint,
  { required }: { required: boolean },
): Promise<Pool[]> {
  const primary = collateral.address.toLowerCase();
  const pairs = new Map<string, [string, string]>();
  const addPair = (a: string, b: string) => {
    if (a === b) return;
    const [token0, token1] = a < b ? [a, b] : [b, a];
    pairs.set(`${token0}-${token1}`, [token0, token1]);
  };
  for (const market of markets) {
    const marketCollateral = market.collateralToken.toLowerCase();
    for (const token of market.wrappedTokens) {
      addPair(token.toLowerCase(), marketCollateral);
      if (marketCollateral !== primary) addPair(token.toLowerCase(), primary);
    }
  }

  // Kept as parallel arrays: the answer is only an address, so the pair it was asked for is what
  // says which tokens the pool holds.
  const probes = [...pairs.values()].flatMap((pair) => FEE_TIERS.map((fee) => ({ pair, fee })));
  console.log(`probing ${pairs.size} token pairs × ${FEE_TIERS.length} fee tiers for pools…`);

  const found = new Map<string, Pool>();
  for (let index = 0; index < probes.length; index += POOL_CALL_BATCH) {
    const slice = probes.slice(index, index + POOL_CALL_BATCH);
    const results = await client.multicall({
      contracts: slice.map(({ pair, fee }) => ({
        address: UNISWAP_V3_FACTORY as Address,
        abi: FACTORY_ABI,
        functionName: "getPool" as const,
        args: [pair[0] as Address, pair[1] as Address, fee],
      })),
      allowFailure: false,
      blockNumber: toBlock,
    });
    (results as Address[]).forEach((address, offset) => {
      if (!address || address === zeroAddress) return;
      found.set(address.toLowerCase(), { id: address.toLowerCase(), tokens: slice[offset].pair });
    });
  }

  if (required && found.size === 0) {
    throw new Error("no pools found for the outcome tokens — pool legs cannot be counted");
  }
  console.log(`${found.size} pools`);
  return [...found.values()];
}

/**
 * Primary collateral a participant put into / took out of the pools, folded into their row.
 *
 * Everything that crosses the pool boundary counts, not only `Swap` events: seeding and pulling
 * liquidity is cash in and out of the same venue, and the wallet that seeded a contest's pools is a
 * participant like any other. Reading swaps alone leaves its fee income attributed to nobody and
 * the pool side of the report short by that much.
 *
 * Measured at the pool rather than at the wallet, because the busiest bots pay for a many-leg buy
 * through an intermediary contract — the wallet never sends the collateral to a pool itself. The
 * outcome tokens do move pool ↔ trader directly, which is what names the trader.
 *
 * `pools` are the pools to watch and `tokens` the outcome tokens whose transfers name the trader.
 * A contest whose pools never hold the primary collateral has nothing to pass here.
 */
export async function addPoolLegs(
  rows: Map<string, ParticipantRow>,
  { pools, tokens, toBlock }: { pools: Set<string>; tokens: readonly string[]; toBlock: bigint },
): Promise<{ unmatchedIn: number; unmatchedOut: number }> {
  const poolIds = [...pools] as Address[];
  let unmatchedIn = 0;
  let unmatchedOut = 0;

  const [cashIn, cashOut, tokensIn, tokensOut] = await Promise.all([
    client.getLogs({
      address: collateral.address as Address,
      event: ERC20_TRANSFER,
      args: { to: poolIds },
      fromBlock: 0n,
      toBlock,
    }),
    client.getLogs({
      address: collateral.address as Address,
      event: ERC20_TRANSFER,
      args: { from: poolIds },
      fromBlock: 0n,
      toBlock,
    }),
    client.getLogs({
      address: tokens as Address[],
      event: ERC20_TRANSFER,
      args: { to: poolIds },
      fromBlock: 0n,
      toBlock,
    }),
    client.getLogs({
      address: tokens as Address[],
      event: ERC20_TRANSFER,
      args: { from: poolIds },
      fromBlock: 0n,
      toBlock,
    }),
  ]);

  const traderByTx = new Map<string, Map<string, number>>();
  for (const log of [...tokensIn, ...tokensOut]) {
    const from = log.args.from!.toLowerCase();
    const trader = pools.has(from) ? log.args.to!.toLowerCase() : from;
    if (pools.has(trader)) continue;
    const traders = traderByTx.get(log.transactionHash!) ?? new Map<string, number>();
    traders.set(trader, (traders.get(trader) ?? 0) + 1);
    traderByTx.set(log.transactionHash!, traders);
  }

  const participantByWallet = new Map<string, string>();
  for (const [participant, row] of rows) {
    for (const held of row.wallets) participantByWallet.set(held, participant);
  }
  const rowForTx = (hash: string) => {
    const trader = [...(traderByTx.get(hash) ?? new Map<string, number>()).entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    const participant = trader ? participantByWallet.get(trader) : undefined;
    // A trader that never minted is not a participant of this report — an arbitrageur or an
    // outside LP. Their flow is summarised rather than dropped silently.
    return participant ? rows.get(participant) : undefined;
  };

  for (const log of cashIn) {
    const amount = Number(formatUnits(log.args.value!, collateral.decimals));
    const row = rowForTx(log.transactionHash!);
    if (row) row.paidToPools += amount;
    else unmatchedIn += amount;
  }
  for (const log of cashOut) {
    const amount = Number(formatUnits(log.args.value!, collateral.decimals));
    const row = rowForTx(log.transactionHash!);
    if (row) row.tookFromPools += amount;
    else unmatchedOut += amount;
  }

  return { unmatchedIn, unmatchedOut };
}

// ── report ───────────────────────────────────────────────────────────────────────────────────

export interface ReportRow {
  wallet: string;
  input: number;
  output: number;
  pnl: number;
  redeemable: number;
  netPnl: number;
  minted: number;
  returned: number;
  paidToPools: number;
  tookFromPools: number;
  wallets: string[];
}

export function buildReport(
  rows: Map<string, ParticipantRow>,
  heldValue: Map<string, number>,
): ReportRow[] {
  const toNumber = (amount: bigint) => Number(formatUnits(amount, collateral.decimals));
  return [...rows.entries()]
    .map(([wallet, row]) => {
      const minted = toNumber(row.split);
      const returned = toNumber(row.mergedAndRedeemed);
      const input = minted + row.paidToPools;
      const output = returned + row.tookFromPools;
      const wallets = [...row.wallets];
      const redeemable = wallets.reduce((sum, held) => sum + (heldValue.get(held) ?? 0), 0);
      return {
        wallet,
        input,
        output,
        pnl: output - input,
        redeemable,
        netPnl: output - input + redeemable,
        minted,
        returned,
        paidToPools: row.paidToPools,
        tookFromPools: row.tookFromPools,
        wallets,
      };
    })
    .sort((a, b) => b.netPnl - a.netPnl);
}

export const sumOf = (report: readonly ReportRow[], pick: (row: ReportRow) => number) =>
  report.reduce((total, row) => total + pick(row), 0);

/** Writes the CSV and prints the totals. Closure checks belong to the caller. */
export function writeReport(outPath: string, report: readonly ReportRow[]): void {
  const round = (value: number) => value.toFixed(6);
  const csv = [
    "wallet,input,output,pnl,redeemable,netPnl",
    ...report.map((row) =>
      [
        row.wallet,
        round(row.input),
        round(row.output),
        round(row.pnl),
        round(row.redeemable),
        round(row.netPnl),
      ].join(","),
    ),
  ].join("\n");

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${csv}\n`);

  console.log(`
wrote ${report.length} participants to ${outPath}`);
  console.log(
    `input ${sumOf(report, (row) => row.input).toFixed(2)} (mint ` +
      `${sumOf(report, (row) => row.minted).toFixed(2)} + pools ` +
      `${sumOf(report, (row) => row.paidToPools).toFixed(2)}) · output ` +
      `${sumOf(report, (row) => row.output).toFixed(2)} (merge/redeem ` +
      `${sumOf(report, (row) => row.returned).toFixed(2)} + pools ` +
      `${sumOf(report, (row) => row.tookFromPools).toFixed(2)}) · redeemable ` +
      `${sumOf(report, (row) => row.redeemable).toFixed(2)} · netPnl ` +
      `${sumOf(report, (row) => row.netPnl).toFixed(2)}`,
  );
}

export function printTop(report: readonly ReportRow[], count = 10): void {
  console.table(
    report.slice(0, count).map((row) => ({
      wallet: row.wallet,
      input: +row.input.toFixed(2),
      output: +row.output.toFixed(2),
      pnl: +row.pnl.toFixed(2),
      redeemable: +row.redeemable.toFixed(2),
      netPnl: +row.netPnl.toFixed(2),
    })),
  );
}

export function run(main: () => Promise<void>): void {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
