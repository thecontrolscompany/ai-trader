export type { Trade, NewTrade, AISignal, NewAISignal } from "@/db/schema";

export interface MarketQuote {
  ticker: string;
  price: number;
  previousClose: number;
  currency: string;
  exchangeName: string;
  marketState: string;
}
