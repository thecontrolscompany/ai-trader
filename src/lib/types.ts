export type { Trade, NewTrade, AISignal, NewAISignal } from "@/db/schema";

export interface MarketQuote {
  ticker: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  currency: string;
  exchangeName: string;
  marketState: string;
}
