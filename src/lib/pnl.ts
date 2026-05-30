import type { Trade } from "./types";

export function calcRealizedPnl(trade: Trade): number | null {
  if (trade.status !== "closed" || trade.exitPrice == null) return null;
  const diff = trade.direction === "long"
    ? trade.exitPrice - trade.entryPrice
    : trade.entryPrice - trade.exitPrice;
  return diff * trade.quantity;
}

export function calcUnrealizedPnl(trade: Trade, currentPrice: number): number {
  const diff = trade.direction === "long"
    ? currentPrice - trade.entryPrice
    : trade.entryPrice - currentPrice;
  return diff * trade.quantity;
}

export function pnlColor(value: number): string {
  if (value > 0) return "text-green-600";
  if (value < 0) return "text-red-600";
  return "text-muted-foreground";
}

export function formatPnl(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${value.toFixed(2)}`;
}
