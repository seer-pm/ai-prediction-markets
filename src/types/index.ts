export interface PredictionRow {
  repo: string;
  parent: string;
  weight: number;
}

export interface MarketData {
  repo: string;
  parent: string;
  currentPrice: number;
  predictedWeight: number;
  difference: number;
  marketId: string;
}

export interface TradeRequest {
  marketId: string;
  amount: number;
  side: 'buy' | 'sell';
}