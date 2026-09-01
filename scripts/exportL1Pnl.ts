/**
 * Per-participant P/L for Round 2 · L1, as CSV.
 *
 * `wallet,input,output,pnl,redeemable,netPnl` — all amounts in sUSDS.
 *
 *   input      sUSDS put in: minting a complete set (parent `PositionSplit`) plus buying
 *              outcome tokens on the pools
 *   output     sUSDS taken back out: merging or redeeming (parent `PositionsMerge` +
 *              `PayoutRedemption`) plus selling outcome tokens on the pools
 *   pnl        output − input, i.e. realised
 *   redeemable settlement value of everything the participant still holds
 *   netPnl     pnl + redeemable — the bottom line once open positions are redeemed
 *
 * Everything is read from the chain. Seer's indexer stalled on Optimism at block 156,195,946
 * (2026-08-29) and so never saw the 2026-08-31 resolution or any redemption after it, which rules
 * out `ConditionalEvent` / `pnl_leaderboard` as sources — see `utils/marketView.ts`.
 *
 *   npm run export:l1-pnl [-- <output.csv>]
 */
import { UNISWAP_GRAPHQL_URL } from "../codegen";
import { MarketViewAbi } from "@/abis/MarketViewAbi";
import { OldTradeExecutorBytecode, TradeExecutorBytecode } from "@/abis/TradeExecutorAbi";
import { OPTIMISM_RPC } from "@/config/rpc";
import { formatBytecode } from "@/utils/common";
import {
  CHAIN_ID,
  CONDITIONAL_TOKENS,
  CREATE_FACTORIES,
  L1_MARKET_ID,
  OTHER_MARKET_ID,
  ROUTER_ADDRESSES,
  SALT_KEY,
  collateral,
} from "@/utils/constants";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createPublicClient,
  encodeAbiParameters,
  encodePacked,
  erc20Abi,
  formatUnits,
  http,
  keccak256,
  parseAbiItem,
  toEventSelector,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { optimism } from "viem/chains";

const MARKET_VIEW = "0x336695ec9efbafd6322fb82eaadbcda02e38f348" as const;
const MARKET_FACTORY = "0x886Ef0A78faBbAE942F1dA1791A8ed02a5aF8BC6" as const;

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;
const ROUTER = ROUTER_ADDRESSES[CHAIN_ID].toLowerCase();
const CTF = CONDITIONAL_TOKENS[CHAIN_ID];

const client = createPublicClient({
  chain: optimism,
  transport: http(OPTIMISM_RPC, { batch: true }),
});

/**
 * Gnosis ConditionalTokens. `conditionId` is indexed on split/merge but *not* on redemption, so a
 * redemption is filtered on the indexed `collateralToken` and matched on the decoded id.
 */
const POSITION_SPLIT = parseAbiItem(
  "event PositionSplit(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)",
);
const POSITIONS_MERGE = parseAbiItem(
  "event PositionsMerge(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)",
);
const PAYOUT_REDEMPTION = parseAbiItem(
  "event PayoutRedemption(address indexed redeemer, address indexed collateralToken, bytes32 indexed parentCollectionId, bytes32 conditionId, uint256[] indexSets, uint256 payout)",
);

const ERC20_TRANSFER = parseAbiItem(
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

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) || 0 }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

/**
 * dRPC load-balances, and the nodes behind it do not all sit at the same height: a receipt for a
 * block this run has already read logs from can still be missing from whichever node answers.
 * Retrying lands on another one.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

/** The CREATE2 address `deployTradeExecutor.ts` would produce for this owner and bytecode. */
function predictExecutorAddress(owner: Address, bytecode: Hex): string {
  const constructorData = encodeAbiParameters([{ type: "address" }], [owner]);
  const deploymentData = `${bytecode}${constructorData.slice(2)}` as Hex;
  const salt = keccak256(encodePacked(["string", "address"], [SALT_KEY, owner]));
  const hash = keccak256(
    encodePacked(
      ["bytes1", "address", "bytes32", "bytes32"],
      ["0xff", CREATE_FACTORIES[CHAIN_ID], salt, keccak256(deploymentData)],
    ),
  );
  return `0x${hash.slice(-40)}`.toLowerCase();
}

const EXECUTOR_BYTECODES = [
  formatBytecode(TradeExecutorBytecode),
  formatBytecode(OldTradeExecutorBytecode),
] as Hex[];

/**
 * Every Uniswap pool holding one of the outcome tokens — the venue for the sells and buys the
 * trade strategy places around a mint, and the venue its liquidity sits in.
 */
async function fetchPools(tokens: string[]): Promise<Set<string>> {
  const query = `{ pools(first: 1000, where: { or: [{ token0_in: ${JSON.stringify(
    tokens,
  )} }, { token1_in: ${JSON.stringify(tokens)} }] }) { id } }`;
  const response = await fetch(UNISWAP_GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = (await response.json()) as { data?: { pools?: { id: string }[] } };
  const pools = body.data?.pools ?? [];
  if (pools.length === 0) {
    // Silently reporting mint-only numbers as if they were the whole story is the one outcome
    // worth refusing: every wallet that traded would be wrong with nothing on screen to say so.
    throw new Error("no pools returned for the outcome tokens — pool legs cannot be counted");
  }
  return new Set(pools.map((pool) => pool.id.toLowerCase()));
}

async function main() {
  const outPath = process.argv[2] ?? "scripts/out/l1-participants.csv";

  // Every read is pinned to one block a little behind the head. The contest is still live — people
  // are redeeming as this runs — and an unpinned run mixes a log from the newest block with a
  // balance read after it, or asks a load-balanced node for a receipt it has not seen yet.
  const toBlock = (await client.getBlockNumber()) - 20n;
  console.log(`snapshot at block ${toBlock}`);

  // ── markets ────────────────────────────────────────────────────────────────────────────────
  const [parent, other] = await client.multicall({
    contracts: [L1_MARKET_ID, OTHER_MARKET_ID].map((id) => ({
      address: MARKET_VIEW as Address,
      abi: MarketViewAbi,
      functionName: "getMarket" as const,
      args: [MARKET_FACTORY as Address, id as Address],
    })),
    allowFailure: false,
  });

  const [parentDenominator, childDenominator] = await client.multicall({
    contracts: [parent.conditionId, other.conditionId].map((conditionId) => ({
      address: CTF as Address,
      abi: PAYOUT_DENOMINATOR_ABI,
      functionName: "payoutDenominator" as const,
      args: [conditionId],
    })),
    allowFailure: false,
  });

  if (!parent.payoutReported || !other.payoutReported) {
    console.warn("warning: a market has not reported payouts — `redeemable` will read 0 for it");
  }

  const parentTokens = parent.wrappedTokens.map((token) => token.toLowerCase());
  const childTokens = other.wrappedTokens.map((token) => token.toLowerCase());
  const parentOutcome = Number(other.parentOutcome);

  // A parent token is worth `numerator / denominator` sUSDS. A child token is collateralised by
  // the parent's outcome-`parentOutcome` token, so its value chains through that ratio.
  const ratio = (numerator: bigint, denominator: bigint) =>
    denominator === 0n ? 0 : Number(numerator) / Number(denominator);
  const parentRatios = parent.payoutNumerators.map((numerator) => ratio(numerator, parentDenominator));
  const carrierRatio = parentRatios[parentOutcome] ?? 0;
  const childRatios = other.payoutNumerators.map(
    (numerator) => ratio(numerator, childDenominator) * carrierRatio,
  );
  const valueByToken = new Map<string, number>();
  parentTokens.forEach((token, index) => valueByToken.set(token, parentRatios[index]));
  childTokens.forEach((token, index) => valueByToken.set(token, childRatios[index]));

  console.log(
    `parent ${parent.id} (${parentTokens.length} outcomes) · child ${other.id} (${childTokens.length} outcomes) ` +
      `under outcome ${parentOutcome} "${parent.outcomes[parentOutcome]}" @ ${carrierRatio.toFixed(6)}`,
  );

  // ── conditional-token flows ────────────────────────────────────────────────────────────────
  const isOurs = (log: { args: { conditionId?: Hex } }) =>
    log.args.conditionId === parent.conditionId || log.args.conditionId === other.conditionId;
  /** Only the root level moves sUSDS; a child split/merge/redeem moves the carrier token. */
  const isCollateralGate = (log: { args: { conditionId?: Hex; parentCollectionId?: Hex } }) =>
    log.args.conditionId === parent.conditionId && log.args.parentCollectionId === ZERO_BYTES32;

  const [splits, merges, redemptions] = await Promise.all([
    client.getLogs({ address: CTF, event: POSITION_SPLIT, fromBlock: 0n, toBlock }),
    client.getLogs({ address: CTF, event: POSITIONS_MERGE, fromBlock: 0n, toBlock }),
    client.getLogs({
      address: CTF,
      event: PAYOUT_REDEMPTION,
      args: { collateralToken: collateral.address as Address },
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
  // The CTF `stakeholder`/`redeemer` is always the Router, so it says nothing about who acted.
  // The holder is the Router's counterparty in the wrapped-token transfers of the same
  // transaction: `splitFromRouter` mints to the Router and forwards to its caller, a merge or
  // redeem pulls from it. That stays exact when the caller is not `tx.to` — one participant here
  // drives several bot contracts from a single EOA, and the positions land in a contract other
  // than the one the transaction was sent to.
  const ourTokens = new Set([...parentTokens, ...childTokens]);
  const hashes = [...new Set(events.map((event) => event.log.transactionHash!))];
  console.log(`resolving holders across ${hashes.length} transactions…`);

  const txInfo = new Map<string, { holder: string | null; from: string; to: string }>();
  await mapPool(hashes, 8, async (hash) => {
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

  // ── holder → participant ───────────────────────────────────────────────────────────────────
  // A trade executor answers `owner()`; that is the EOA to report under. Anything else holding
  // positions — a participant's own bot contract — has no owner to ask, so it falls back to the
  // EOA that sends its transactions. `tx.from` is *not* usable on an executor: this app drives
  // executors with disposable browser session keys (`sessionKey.ts`), so one participant's
  // transactions arrive from many one-off addresses (seven, for the busiest wallet here).
  const holders = [
    ...new Set([...txInfo.values()].map((tx) => tx.holder).filter((holder): holder is string => !!holder)),
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

  // ── aggregate ──────────────────────────────────────────────────────────────────────────────
  type Row = {
    /** sUSDS through the Router, in wei — exact, so it is kept apart from the swap legs. */
    split: bigint;
    mergedAndRedeemed: bigint;
    /** sUSDS paid to / received from the pools — trading and liquidity alike. */
    paidToPools: number;
    tookFromPools: number;
    wallets: Set<string>;
  };
  const rows = new Map<string, Row>();
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

  // Executors that were deployed but never touched by a transaction we walked can still hold
  // positions — the indexer-blind case `executorOwners.ts` documents. Derive and include them.
  const derived: { participant: string; executor: string }[] = [];
  for (const [participant, row] of rows) {
    for (const bytecode of EXECUTOR_BYTECODES) {
      const executor = predictExecutorAddress(participant as Address, bytecode);
      if (executor !== participant && !row.wallets.has(executor)) {
        derived.push({ participant, executor });
      }
    }
  }
  const derivedCodes = await mapPool(derived, 10, ({ executor }) =>
    client.getCode({ address: executor as Address }).catch(() => undefined),
  );
  derived.forEach(({ participant, executor }, index) => {
    const code = derivedCodes[index];
    if (code && code !== "0x") rows.get(participant)!.wallets.add(executor);
  });

  // ── open positions ─────────────────────────────────────────────────────────────────────────
  const allWallets = [...new Set([...rows.values()].flatMap((row) => [...row.wallets]))];
  const tokens = [...parentTokens, ...childTokens];
  console.log(`reading ${tokens.length} balances × ${allWallets.length} wallets…`);

  const balanceCalls = allWallets.flatMap((wallet) =>
    tokens.map((token) => ({
      address: token as Address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [wallet as Address],
    })),
  );
  const balances: bigint[] = [];
  const BATCH = 500;
  for (let i = 0; i < balanceCalls.length; i += BATCH) {
    const chunk = await client.multicall({
      contracts: balanceCalls.slice(i, i + BATCH),
      allowFailure: false,
      blockNumber: toBlock,
    });
    balances.push(...(chunk as bigint[]));
  }

  const redeemableByWallet = new Map<string, number>();
  allWallets.forEach((wallet, walletIndex) => {
    let value = 0;
    tokens.forEach((token, tokenIndex) => {
      const balance = balances[walletIndex * tokens.length + tokenIndex];
      if (balance === 0n) return;
      value += Number(formatUnits(balance, collateral.decimals)) * (valueByToken.get(token) ?? 0);
    });
    redeemableByWallet.set(wallet, value);
  });

  // ── pool legs ──────────────────────────────────────────────────────────────────────────────
  // The trade strategy does not only mint: it sells the outcomes priced above the prediction and
  // buys the ones priced below (`useExecuteTradeStrategy`), and that sUSDS never crosses the
  // collateral gate. Left out, a wallet that bought complete sets on the pools and merged them
  // reads as pure profit and its counterparty as pure loss. So sUSDS a participant puts into the
  // pools joins `input` and sUSDS the pools pay back joins `output`.
  //
  // Everything that crosses the pool boundary counts, not only `Swap` events: seeding and pulling
  // liquidity is cash in and out of the same venue, and the wallet that seeded these pools is a
  // participant like any other. Reading swaps alone leaves its fee income attributed to nobody and
  // the pool side of the report short by that much.
  //
  // Measured at the pool rather than at the wallet, because the busiest bots pay for a 68-leg buy
  // through an intermediary contract — the wallet never sends sUSDS to a pool itself. The outcome
  // tokens do move pool ↔ trader directly, which is what names the trader.
  const pools = await fetchPools([...ourTokens]);
  const poolIds = [...pools] as Address[];
  let unmatchedIn = 0;
  let unmatchedOut = 0;
  {
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
      return participant ? rows.get(participant)! : undefined;
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
  }

  // No wallet may be claimed by two participants, or its balance is counted twice.
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

  // ── csv ────────────────────────────────────────────────────────────────────────────────────
  const toNumber = (amount: bigint) => Number(formatUnits(amount, collateral.decimals));
  const report = [...rows.entries()]
    .map(([wallet, row]) => {
      const minted = toNumber(row.split);
      const returned = toNumber(row.mergedAndRedeemed);
      const input = minted + row.paidToPools;
      const output = returned + row.tookFromPools;
      const walletsOf = [...row.wallets];
      const redeemable = walletsOf.reduce((sum, held) => sum + (redeemableByWallet.get(held) ?? 0), 0);
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
        wallets: walletsOf,
      };
    })
    .sort((a, b) => b.netPnl - a.netPnl);

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

  const sum = (pick: (row: (typeof report)[number]) => number) =>
    report.reduce((total, row) => total + pick(row), 0);
  console.log(`
wrote ${report.length} participants to ${outPath}`);
  console.log(
    `input ${sum((row) => row.input).toFixed(2)} (mint ${sum((row) => row.minted).toFixed(2)} + ` +
      `pools ${sum((row) => row.paidToPools).toFixed(2)}) · output ` +
      `${sum((row) => row.output).toFixed(2)} (merge/redeem ${sum((row) => row.returned).toFixed(2)} ` +
      `+ pools ${sum((row) => row.tookFromPools).toFixed(2)}) · redeemable ` +
      `${sum((row) => row.redeemable).toFixed(2)} · netPnl ${sum((row) => row.netPnl).toFixed(2)}`,
  );
  // Two closures, both of which must hold. The gate: every sUSDS minted is merged, redeemed or
  // still redeemable, so what is left over is what leaked to addresses that never minted. The
  // pools: they started empty and are empty again, so what went in has come back out.
  console.log(
    `gate closes to ${(
      sum((row) => row.minted) - sum((row) => row.returned) - sum((row) => row.redeemable)
    ).toFixed(2)} · pools close to ${(
      sum((row) => row.paidToPools) + unmatchedIn - sum((row) => row.tookFromPools) - unmatchedOut
    ).toFixed(2)} (${unmatchedIn.toFixed(2)} in / ${unmatchedOut.toFixed(2)} out belongs to ` +
      "addresses that never minted)",
  );
  if (unattributed > 0n) {
    console.log(`unattributed flow: ${toNumber(unattributed).toFixed(2)}`);
  }

  console.table(
    report.slice(0, 10).map((row) => ({
      wallet: row.wallet,
      input: +row.input.toFixed(2),
      output: +row.output.toFixed(2),
      pnl: +row.pnl.toFixed(2),
      redeemable: +row.redeemable.toFixed(2),
      netPnl: +row.netPnl.toFixed(2),
    })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
