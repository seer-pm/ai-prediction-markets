import { SupportedChain } from "@/utils/constants";
import { UniswapTrade } from "@swapr/sdk";
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

export interface TableData {
  repo: string;
  parent: string | null;
  currentPrice: number | null;
  predictedWeight: number | null;
  difference: number | null;
  marketId: string;
  hasPrediction: boolean;
  volumeUntilPrice: number;
  balance?: bigint;
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
  amount?: string
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
  trade: UniswapTrade;
}

export interface QuoteProps {
  account: Address;
  amount: string;
  tableData: TableData[];
}

export interface OriginalityQuoteProps {
  account: Address;
  tableData: OriginalityTableData[];
}

export interface TradeProps {
  tradeExecutor: Address;
  amount: string;
  getQuotesResult: { quotes: UniswapQuoteTradeResult[]; mergeAmount: bigint } | undefined;
  wrappedTokens: Address[];
}

export interface OriginalityTradeProps {
  tradeExecutor: Address;
  amount: string;
  tableData: OriginalityTableData[];
}

export interface ApprovalRequest {
  tokensAddresses: Address[];
  account: Address | undefined;
  spender: Address;
  amounts: bigint | bigint[];
  chainId: SupportedChain;
}
