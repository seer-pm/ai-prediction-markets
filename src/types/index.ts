import { SupportedChain } from "@/utils/constants";
import { MarketStatus } from "@seer-pm/sdk";
import { GetPoolHourDatasQuery } from "@seer-pm/sdk/subgraph/swapr";
import { Address, TransactionReceipt } from "viem";

export interface PredictionRow {
  repo: string;
  parent: string;
  weight: number;
}

export interface OriginalityRow {
  repo: string;
  originality: number;
}

export interface L2Row {
  repo: string;
  dependency: string;
  weight: number;
}

export interface OctantRow {
  project: string;
  weight: number;
}

export interface ZcashRow {
  project: string;
  /** The user's estimate, in [0, 1], that coinholders approve this grant. */
  probability: number;
}

export interface TableData {
  repo: string;
  parent: string | null;
  currentPrice: number | null;
  predictedWeight: number | null;
  difference: number | null;
  outcomeId: string;
  hasPrediction: boolean;
  volumeUntilPrice: number;
  balance?: bigint;
  payout?: number;
  isOther: boolean;
}
export interface OriginalityTableData {
  repo: string;
  upPrice: number | null;
  downPrice: number | null;
  predictedOriginality: number | null;
  upDifference: number | null;
  downDifference: number | null;
  marketId: string;
  hasPrediction: boolean;
  volumeUntilUpPrice: number;
  volumeUntilDownPrice: number;
  // Prediction-independent sell bounds used by the UP+DOWN>1 arbitrage:
  // volume to push each pool to its proportional share of 1.
  volumeUntilUpEqual: number;
  volumeUntilDownEqual: number;
  upBalance?: bigint;
  downBalance?: bigint;
  wrappedTokens: Address[];
  collateralToken: Address;
  amount?: string;
}

/**
 * One Zcash market's row. Unlike `OriginalityTableData` these markets are top-level and
 * collateralized in sUSDS, so `collateralToken` is always the primary collateral and the mint
 * budget has to be divided across rows rather than replicated into each.
 */
export interface ZcashTableData {
  /** Proposal title — the predictions CSV joins on this. */
  project: string;
  applicant: string;
  requestedUsd: number;
  tier: string;
  yesPrice: number | null;
  noPrice: number | null;
  /** The user's number from the CSV, in [0, 1]. Null means no view. */
  predictedProbability: number | null;
  yesDifference: number | null;
  noDifference: number | null;
  marketId: string;
  hasPrediction: boolean;
  volumeUntilYesPrice: number;
  volumeUntilNoPrice: number;
  // Prediction-independent sell bounds used by the YES+NO>1 arbitrage:
  // volume to push each pool to its proportional share of 1.
  volumeUntilYesEqual: number;
  volumeUntilNoEqual: number;
  yesBalance?: bigint;
  noBalance?: bigint;
  /** `[YES, NO, INVALID]` — see `YES_INDEX`/`NO_INDEX` in `utils/zcashMarkets`. */
  wrappedTokens: Address[];
  collateralToken: Address;
  /** sUSDS this row may spend: its slice of the mint budget plus its own sell proceeds. */
  amount?: string;
}

export type ZcashQuoteType = "arb-sell" | "paired" | "dual-buy" | "dual-sell";

export interface ZcashQuoteResult {
  quoteType: ZcashQuoteType;
  quotes: UniswapQuoteTradeResult[];
  row: ZcashTableData;
  /** Complete sets to mint for this row before its sell legs can settle. */
  mintAmount?: string;
}

export interface ZcashTradeProps {
  tradeExecutor: Address;
  amount: string;
  tableData: ZcashTableData[];
}

export interface OriginalityQuoteResult {
  quoteType: string;
  quotes: UniswapQuoteTradeResult[];
  row: OriginalityTableData;
  // Complete sets to mint for the arb-sell branch (mint exactly what we sell).
  mintAmount?: string;
}

export interface L2TableData {
  marketId: string;
  repo: string;
  dependency: string;
  currentPrice: number | null;
  predictedWeight: number | null;
  difference: number | null;
  outcomeId: string;
  hasPrediction: boolean;
  volumeUntilPrice: number;
  collateralToken: Address;
  wrappedTokens: Address[];
  balance?: bigint;
  payout?: number;
}

export interface TradeRequest {
  marketId: string;
  amount: number;
  side: "buy" | "sell";
}

export interface PoolInfo {
  liquidity: string;
  tick: string;
  token0: Address;
  token1: Address;
  ticks: { liquidityNet: string; tickIdx: string }[];
  feeTier?: string;
}

export interface Token {
  address: Address;
  symbol: string;
  decimals: number;
  wrapped?: Token;
}

export type QuoteTradeFn = (
  chainId: number,
  account: Address | undefined,
  amount: string,
  outcomeToken: Token,
  collateralToken: Token,
  swapType: "buy" | "sell",
) => Promise<UniswapQuoteTradeResult>;

export interface UniswapQuoteTradeResult {
  value: bigint;
  decimals: number;
  buyToken: Address;
  sellToken: Address;
  sellAmount: string;
  swapType: "buy" | "sell";
  fee: number; // Uniswap V3 fee tier (100, 500, 3000, 10000)
  gasEstimate?: bigint;
}

export interface QuoteProps {
  account: Address;
  amount: string;
  tableData: TableData[];
}

export interface L2QuoteProps {
  account: Address;
  amount: string;
  tableData: L2TableData[];
}

export interface OriginalityQuoteProps {
  account: Address;
  tableData: OriginalityTableData[];
}

export interface TradeProps {
  tradeExecutor: Address;
  amount: string;
  getQuotesResult:
    | { quotes: UniswapQuoteTradeResult[]; mergeAmount: bigint; otherTokensFromMergeOther: bigint }
    | undefined;
  tableData: TableData[];
}

export interface OriginalityTradeProps {
  tradeExecutor: Address;
  amount: string;
  tableData: OriginalityTableData[];
}

export interface L2TradeProps {
  tradeExecutor: Address;
  amount: string;
  tableData: L2TableData[];
  getQuotesResults: { quotes: UniswapQuoteTradeResult[]; mergeAmount: bigint }[];
}

export interface ApprovalRequest {
  tokensAddresses: Address[];
  account: Address | undefined;
  spender: Address;
  amounts: bigint | bigint[];
  chainId: SupportedChain;
}

/**
 * Named stages of a batched run. A strategy is 5–20 sequential transactions,
 * so progress is reported as a phase plus a batch counter rather than a single
 * string that gets overwritten — see `RunLedger`.
 */
export type TxPhase =
  | "authorize"
  | "mint"
  | "sell"
  | "requote"
  | "merge"
  | "buy"
  | "redeem"
  | "unwind"
  | "settle"
  | "work";

export type TxProgress = {
  phase: TxPhase;
  /** Human-readable detail for the current phase. */
  label: string;
  /** Batch counter within the phase, when there is more than one. */
  step?: number;
  of?: number;
  /**
   * This stage had nothing to do and was passed over. Reported explicitly so the ledger can say
   * so at the moment it happens — a silent skip left the row unchecked until the run ended and
   * then ticked it along with everything else, which reads as though nothing was happening.
   */
  skipped?: boolean;
};

export type TxStateChange = (progress: TxProgress) => void;

export type CallBatchesInput = {
  calls: {
    to: `0x${string}`;
    value?: bigint;
    data: `0x${string}`;
  }[];
  message: string;
  /** Which stage of the run this batch belongs to. Defaults to "work". */
  phase?: TxPhase;
  step?: number;
  of?: number;
  skipFailCalls?: boolean;
}[];

/** viem/wagmi errors carry a `shortMessage` that reads better than the full `message`. */
export type BatchTxError = Error & { shortMessage?: string };

/**
 * Outcome of a multi-batch submission. `executedCalls` counts the calls that actually made it
 * on-chain, so callers can tell "every call was pruned during simulation" apart from "the batch
 * simulated fine but nothing was ever broadcast".
 */
export type BatchTxResult =
  | {
      status: true;
      receipt?: TransactionReceipt;
      executedCalls: number;
      prunedCalls: number;
      skippedBatches: number;
    }
  | { status: false; error: BatchTxError };

export type PoolHourData = {
  token0Price: string;
  token1Price: string;
  periodStartUnix: number;
  sqrtPrice: string;
  liquidity: string;
  pool: {
    id: string;
    token0: { id: string; name: string };
    token1: { id: string; name: string };
  };
};

export type PoolHourDatasSets = GetPoolHourDatasQuery["poolHourDatas"][];

export type ChartWithMarketData = {
  poolHourDatas: PoolHourData[];
  marketId: string;
  outcomeName: string;
  outcomeId: Address;
  collateral: Address;
}[];

/**
 * A chart series, already resampled and ready to hand to lightweight-charts.
 *
 * Built once by the background job (`netlify/functions/utils/buildChartSeries.ts`) rather than in the
 * browser: a contest runs 40-100 outcomes at a time, and resampling raw `PoolHourData` per outcome —
 * binary search per tick plus BigInt sqrtPrice math — is what made the charts slow to appear.
 */
export type ChartSeries = {
  marketId: string;
  outcomeName: string;
  outcomeId: Address;
  /** [unix seconds, price], on a 30-minute grid with flat runs collapsed to their endpoints. */
  points: [number, number][];
  /** Latest resolvable price. Drives the legend readout and its sort order. */
  lastPrice: number | null;
};

/**
 * One row of a Zcash NU7 predictions CSV: `question,outcome,prediction`.
 *
 * The only contest whose markets are categorical, so a row has to name both the ballot question and
 * which outcome within it. Both identifiers already exist and are stable — see
 * `@/utils/zcashNu7Markets` for the question numbering and `parseZcashNu7CSV` for the outcome one.
 */
export interface ZcashNu7Row {
  /** 1-based ballot number — matches `ZcashNu7Market.id`. */
  question: number;
  /**
   * 1-based over this market's *substantive* outcomes. Invalid is never numbered: it is always the
   * last on-chain outcome (`invalidIndexOf`), has no pool, and its price is always null, so it can
   * be neither predicted nor traded.
   */
  outcome: number;
  /**
   * The absolute pool price this one outcome should trade at, in [0, 1]. Not a share of the
   * question — but the outcomes of one question are mutually exclusive, so the full set of targets
   * does have to sum to 1. A file need not spell all of it out: `completeNu7Targets` derives
   * whatever is left out from the market's own prices, the same way the binary contest derives NO
   * from YES. A question summing above 1 is rejected by `parseZcashNu7CSV`.
   */
  prediction: number;
}

/** One substantive outcome of one NU7 market, diffed against the user's number. */
export interface ZcashNu7OutcomeRow {
  /**
   * Index into `outcomes` / `wrappedTokens` / `prices` / `pools`. The only index the router and the
   * pool lookups may ever be given — see `substantiveIndexes` in `useProcessZcashNu7Predictions`.
   */
  outcomeIndex: number;
  /** The 1-based number the CSV uses, and the badge printed on the card. */
  outcomeNumber: number;
  /** Outcome label, verbatim from chain. */
  outcome: string;
  token: Address;
  /** Null when this outcome has no pool. */
  price: number | null;
  /**
   * The target for this pool, clamped to [MIN_PRICE, 1 - MIN_PRICE]. Null means the question was
   * not annotated at all, or this outcome has no pool. Within an annotated question the targets sum
   * to 1 across the pooled outcomes — see `completeNu7Targets`.
   */
  target: number | null;
  /** `target - price`. Null when either is null. */
  difference: number | null;
  /** Swap input to move this pool to `target`: collateral for a buy, outcome tokens for a sell. */
  volumeUntilPrice: number;
  balance?: bigint;
  /**
   * Where the target came from. `"file"` is a row the user wrote; `"derived"` is one the completion
   * filled in from the probability their rows left over. Null when there is no target. Presentation
   * only — the planner treats the two identically, which is the point of completing them.
   */
  source: "file" | "derived" | null;
  /**
   * Whether this leg has a usable target, and so may be traded. NOT "the user typed this one" —
   * that is `source === "file"`. A derived leg is as tradable as a written one.
   */
  hasTarget: boolean;
}

export interface ZcashNu7TableData {
  marketId: Address;
  /** 1-based ballot number. */
  question: number;
  shortName: string;
  marketName: string;
  collateralToken: Address;
  /** EVERY outcome token in on-chain order, Invalid included — `splitPosition` needs the whole set. */
  wrappedTokens: Address[];
  /** Substantive outcomes only, in on-chain order. */
  outcomes: ZcashNu7OutcomeRow[];
  marketStatus: MarketStatus;
  /** sUSDS this market may spend — its slice of the mint budget. Set by the allocator. */
  amount?: string;
}

/** Informative only, for debugging a run — nothing branches on it. */
export type ZcashNu7QuoteType = "sell" | "buy" | "mixed";

export interface ZcashNu7QuoteResult {
  quoteType: ZcashNu7QuoteType;
  /** Sells first, then buys. The order is load-bearing — see `getZcashNu7Quote`. */
  quotes: UniswapQuoteTradeResult[];
  row: ZcashNu7TableData;
  /** Complete sets to mint for this market before its sell legs can settle. */
  mintAmount?: string;
}

export interface ZcashNu7TradeProps {
  tradeExecutor: Address;
  amount: string;
  tableData: ZcashNu7TableData[];
}
