import { desc, eq, isNotNull, and } from "drizzle-orm";
import { db } from "@/db";
import { aiSignals, trades } from "@/db/schema";

export interface HistoricalScanContext {
  summary: string;
  highlights: string[];
}

type ClosedSignalTrade = {
  ticker: string;
  model: string | null;
  confidence: number | null;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
};

type BucketStats = {
  count: number;
  wins: number;
  pnl: number;
};

function realizedPnl(trade: ClosedSignalTrade): number {
  const perShare = trade.direction === "short"
    ? trade.entryPrice - trade.exitPrice
    : trade.exitPrice - trade.entryPrice;
  return perShare * trade.quantity;
}

function confidenceBucket(confidence: number | null): string {
  if (confidence == null || Number.isNaN(confidence)) return "unknown";
  if (confidence >= 0.85) return "0.85-1.00";
  if (confidence >= 0.70) return "0.70-0.84";
  if (confidence >= 0.55) return "0.55-0.69";
  return "<0.55";
}

export async function getHistoricalScanContext(limit = 200): Promise<HistoricalScanContext> {
  const rows = await db.select({
    ticker: trades.ticker,
    model: aiSignals.model,
    confidence: aiSignals.confidence,
    direction: trades.direction,
    entryPrice: trades.entryPrice,
    exitPrice: trades.exitPrice,
    quantity: trades.quantity,
  })
    .from(trades)
    .leftJoin(aiSignals, eq(trades.aiSignalId, aiSignals.id))
    .where(and(eq(trades.status, "closed"), isNotNull(trades.exitPrice), isNotNull(trades.aiSignalId)))
    .orderBy(desc(trades.closedAt))
    .limit(limit);

  if (rows.length === 0) {
    return {
      summary: "No closed AI-linked paper trades yet. Use fundamentals, trend quality, and downside risk as the primary filters.",
      highlights: [
        "Treat the current scan as a cold start.",
        "Prefer cleaner setups with obvious downside control.",
      ],
    };
  }

  let totalPnl = 0;
  let wins = 0;
  let losers = 0;
  const byModel = new Map<string, BucketStats>();
  const byTicker = new Map<string, BucketStats>();
  const byConfidence = new Map<string, BucketStats>();

  for (const row of rows as ClosedSignalTrade[]) {
    const pnl = realizedPnl(row);
    const win = pnl > 0;
    totalPnl += pnl;
    wins += win ? 1 : 0;
    losers += win ? 0 : 1;

    const modelKey = row.model ?? "unknown";
    const tickerKey = row.ticker;
    const confidenceKey = confidenceBucket(row.confidence);

    for (const [key, map] of [
      [modelKey, byModel],
      [tickerKey, byTicker],
      [confidenceKey, byConfidence],
    ] as const) {
      const stats = map.get(key) ?? { count: 0, wins: 0, pnl: 0 };
      stats.count += 1;
      stats.wins += win ? 1 : 0;
      stats.pnl += pnl;
      map.set(key, stats);
    }
  }

  const bestModel = [...byModel.entries()]
    .filter(([, s]) => s.count >= 3)
    .sort((a, b) => b[1].pnl - a[1].pnl)[0];
  const bestTickers = [...byTicker.entries()]
    .filter(([, s]) => s.count >= 2)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .slice(0, 3);
  const worstTickers = [...byTicker.entries()]
    .filter(([, s]) => s.count >= 2)
    .sort((a, b) => a[1].pnl - b[1].pnl)
    .slice(0, 3);
  const bestConfidenceBand = [...byConfidence.entries()]
    .filter(([, s]) => s.count >= 3)
    .sort((a, b) => b[1].wins / b[1].count - a[1].wins / a[1].count)[0];

  const winRate = (wins / rows.length) * 100;

  const highlights = [
    `Closed AI-linked trades: ${rows.length} · win rate ${winRate.toFixed(1)}% · realized P&L ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`,
  ];

  if (bestModel) {
    const [model, stats] = bestModel;
    highlights.push(
      `Best model so far: ${model} (${stats.count} trades, ${stats.wins}/${stats.count} wins, ${stats.pnl >= 0 ? "+" : ""}$${stats.pnl.toFixed(2)})`
    );
  }

  if (bestConfidenceBand) {
    const [band, stats] = bestConfidenceBand;
    highlights.push(
      `Strongest confidence band: ${band} (${stats.count} trades, ${((stats.wins / stats.count) * 100).toFixed(1)}% win rate)`
    );
  }

  if (bestTickers.length > 0) {
    highlights.push(
      `Best tickers historically: ${bestTickers.map(([ticker, stats]) => `${ticker} (${stats.count}, ${stats.pnl >= 0 ? "+" : ""}$${stats.pnl.toFixed(2)})`).join(", ")}`
    );
  }

  if (worstTickers.length > 0) {
    highlights.push(
      `Weakest tickers historically: ${worstTickers.map(([ticker, stats]) => `${ticker} (${stats.count}, ${stats.pnl >= 0 ? "+" : ""}$${stats.pnl.toFixed(2)})`).join(", ")}`
    );
  }

  return {
    summary:
      "Use these historical results as calibration, not as hard rules. Reward setups that resemble the account's winners, and be skeptical of patterns that have repeatedly lost money.",
    highlights,
  };
}
