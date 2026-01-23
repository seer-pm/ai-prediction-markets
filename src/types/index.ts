import { SupportedChain } from "@/utils/constants";
import { Address } from "viem";

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
  upBalance?: bigint;
  downBalance?: bigint;
  wrappedTokens: Address[];
  collateralToken: Address;
  amount?: string;
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
  collateralToken:Address;
  wrappedTokens: Address[]
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
  swapType: "buy" | "sell"
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
