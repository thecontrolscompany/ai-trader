export type AssetClass = "stock" | "etf" | "bond" | "crypto" | "option";
export type Direction = "long" | "short";
export type TradeStatus = "open" | "closed" | "cancelled";

export interface Trade {
  id: string;
  ticker: string;
  assetClass: AssetClass;
  direction: Direction;
  status: TradeStatus;
  entryPrice: number;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  exitPrice: number | null;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  aiSignalId: string | null;
}

export interface MarketQuote {
  ticker: string;
  price: number;
  previousClose: number;
  currency: string;
  exchangeName: string;
  marketState: string;
}

export interface PortfolioSummary {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winRate: number | null;
  realizedPnl: number;
  unrealizedPnl: number;
}
