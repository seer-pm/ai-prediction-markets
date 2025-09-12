import { SupportedChain } from "@/utils/constants";
import { UniswapTrade } from "@swapr/sdk";
import { Address } from "viem";

export interface PredictionRow {
  repo: string;
  parent: string;
  weight: number;
}

export interface TableData {
  repo: string;
  parent: string;
  currentPrice: number;
  predictedWeight: number;
  difference: number;
  marketId: string;
  hasMarketData: boolean;
  volumeUntilPrice: number;
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

export interface TradeProps {
  account: Address;
  amount: number;
  tableData: TableData[];
  chainId: SupportedChain;
  collateral: Token;
}
