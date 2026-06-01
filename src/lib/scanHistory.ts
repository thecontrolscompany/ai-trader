import { desc, eq, isNotNull, and } from "drizzle-orm";
import { db } from "@/db";
import { aiSignals, trades } from "@/db/schema";
import { getQuotes } from "@/lib/marketProvider";
import type { EnrichedStockRow } from "@/lib/stockAnalysis";

export interface HistoricalScanContext {
  summary: string;
  highlights: string[];
}

type SignalTrade = {
  ticker:      string;
  model:       string | null;
  confidence:  number | null;
  direction:   "long" | "short";
  entryPrice:  number;
  exitPrice:   number | null;
  quantity:    number;
  status:      "open" | "closed" | "cancelled";
  trendDirection?: string | null;
  rsi14?:      number | null;
};

type BucketStats = { count: number; wins: number; pnl: number };

function realizedPnl(entry: number, exit: number, qty: number, dir: "long" | "short"): number {
  return (dir === "long" ? exit - entry : entry - exit) * qty;
}

function confidenceBucket(c: number | null): string {
  if (c == null || Number.isNaN(c)) return "unknown";
  if (c >= 0.85) return "0.85–1.00";
  if (c >= 0.70) return "0.70–0.84";
  if (c >= 0.55) return "0.55–0.69";
  return "<0.55";
}

function pnlStr(n: number): string {
  return (n >= 0 ? "+" : "") + "$" + Math.abs(n).toFixed(2);
}

function pctStr(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

export async function getHistoricalScanContext(
  universe?: EnrichedStockRow[],
  limit = 150,
): Promise<HistoricalScanContext> {

  // Fetch all AI-linked trades (open + closed) in parallel with quote fetch setup
  const allRows = await db.select({
    ticker:     trades.ticker,
    model:      aiSignals.model,
    confidence: aiSignals.confidence,
    direction:  trades.direction,
    entryPrice: trades.entryPrice,
    exitPrice:  trades.exitPrice,
    quantity:   trades.quantity,
    status:     trades.status,
  })
    .from(trades)
    .leftJoin(aiSignals, eq(trades.aiSignalId, aiSignals.id))
    .where(isNotNull(trades.aiSignalId))
    .orderBy(desc(trades.openedAt))
    .limit(limit) as SignalTrade[];

  const openRows   = allRows.filter(r => r.status === "open");
  const closedRows = allRows.filter(r => r.status === "closed" && r.exitPrice != null);

  // ── 1. OPEN POSITIONS — live P&L feedback ──────────────────────────────
  const openLines: string[] = [];
  if (openRows.length > 0) {
    const tickers = [...new Set(openRows.map(r => r.ticker))];
    const quotes  = await getQuotes(tickers);

    for (const row of openRows) {
      const price = quotes.get(row.ticker)?.price ?? row.entryPrice;
      const rawPct = ((price - row.entryPrice) / row.entryPrice) * 100;
      const pct    = row.direction === "short" ? -rawPct : rawPct;
      const status = pct >= 3 ? "✓ WORKING" : pct <= -3 ? "✗ LOSING" : "→ FLAT";
      openLines.push(
        `  ${row.ticker} ${row.direction}: entry $${row.entryPrice.toFixed(2)}, now $${price.toFixed(2)} → ${pctStr(pct)} ${status}`
      );
    }
  }

  // ── 2. CLOSED TRADES — outcomes and patterns ──────────────────────────
  const closedLines: string[] = [];
  const byTicker     = new Map<string, BucketStats>();
  const byConfidence = new Map<string, BucketStats>();
  const byDirection  = new Map<string, BucketStats>();
  let totalPnl = 0;
  let wins = 0;

  for (const row of closedRows) {
    const pnl = realizedPnl(row.entryPrice, row.exitPrice!, row.quantity, row.direction);
    const win = pnl > 0;
    totalPnl += pnl;
    wins     += win ? 1 : 0;

    for (const [key, map] of [
      [row.ticker,                  byTicker],
      [confidenceBucket(row.confidence), byConfidence],
      [row.direction,               byDirection],
    ] as [string, Map<string, BucketStats>][]) {
      const s = map.get(key) ?? { count: 0, wins: 0, pnl: 0 };
      s.count++; s.wins += win ? 1 : 0; s.pnl += pnl;
      map.set(key, s);
    }
  }

  if (closedRows.length > 0) {
    const winRate = (wins / closedRows.length) * 100;
    closedLines.push(
      `  ${closedRows.length} closed trades · win rate ${winRate.toFixed(1)}% · total P&L ${pnlStr(totalPnl)}`
    );

    // Best/worst tickers
    const sorted = [...byTicker.entries()].sort((a, b) => b[1].pnl - a[1].pnl);
    const best3  = sorted.slice(0, 3).filter(([, s]) => s.pnl > 0);
    const worst3 = sorted.slice(-3).reverse().filter(([, s]) => s.pnl < 0);
    if (best3.length)  closedLines.push(`  Best tickers:  ${best3.map(([t, s]) => `${t} (${pnlStr(s.pnl)}, ${s.wins}/${s.count} wins)`).join(" · ")}`);
    if (worst3.length) closedLines.push(`  Worst tickers: ${worst3.map(([t, s]) => `${t} (${pnlStr(s.pnl)}, ${s.wins}/${s.count} wins)`).join(" · ")}`);

    // Direction bias
    const longs  = byDirection.get("long");
    const shorts = byDirection.get("short");
    if (longs && shorts) {
      const longWr  = longs.count  > 0 ? ((longs.wins  / longs.count)  * 100).toFixed(0) : "—";
      const shortWr = shorts.count > 0 ? ((shorts.wins / shorts.count) * 100).toFixed(0) : "—";
      closedLines.push(`  Long win rate: ${longWr}% (${longs.count} trades) · Short win rate: ${shortWr}% (${shorts.count} trades)`);
    }

    // Confidence calibration
    const confSorted = [...byConfidence.entries()]
      .filter(([, s]) => s.count >= 2)
      .sort((a, b) => b[1].wins / b[1].count - a[1].wins / a[1].count);
    if (confSorted.length > 0) {
      closedLines.push(
        `  Confidence calibration: ${confSorted.map(([band, s]) => `${band} → ${((s.wins / s.count) * 100).toFixed(0)}% win (${s.count} trades)`).join(" · ")}`
      );
    }

    // 5 most recent individual trade outcomes
    closedLines.push("  Recent outcomes (newest first):");
    for (const row of closedRows.slice(0, 5)) {
      const pnl  = realizedPnl(row.entryPrice, row.exitPrice!, row.quantity, row.direction);
      const pct  = ((row.exitPrice! - row.entryPrice) / row.entryPrice) * 100 * (row.direction === "short" ? -1 : 1);
      const icon = pnl > 0 ? "✓" : "✗";
      closedLines.push(
        `    ${icon} ${row.ticker} ${row.direction}: entry $${row.entryPrice.toFixed(2)} → exit $${row.exitPrice!.toFixed(2)} (${pctStr(pct)}, ${pnlStr(pnl)})`
      );
    }
  }

  // ── 3. MISSED MOVERS — stocks in universe that moved but weren't picked ─
  const moversLines: string[] = [];
  if (universe && universe.length > 0) {
    const recentPicks = new Set(allRows.map(r => r.ticker));

    // Stocks with significant 5-day move not currently held or recently traded
    const movers = universe
      .filter(s => s.return5d != null && Math.abs(s.return5d) >= 4)
      .sort((a, b) => Math.abs(b.return5d ?? 0) - Math.abs(a.return5d ?? 0))
      .slice(0, 8);

    if (movers.length > 0) {
      movers.forEach(s => {
        const held = recentPicks.has(s.symbol);
        const tag  = held ? "(you hold this)" : "(NOT in your picks)";
        const dir  = (s.return5d ?? 0) > 0 ? "▲" : "▼";
        moversLines.push(
          `  ${dir} ${s.symbol}: ${pctStr(s.return5d ?? 0)} in 5 days, RSI ${s.rsi14?.toFixed(0) ?? "—"}, trend ${s.trendDirection} ${tag}`
        );
      });
    }

    // Today's biggest % movers in universe
    const todayMovers = [...universe]
      .filter(s => Math.abs(s.changePct) >= 2)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 5);

    if (todayMovers.length > 0) {
      moversLines.push("  Today's biggest moves in your universe:");
      todayMovers.forEach(s => {
        const held = recentPicks.has(s.symbol);
        const tag  = held ? "(you hold)" : "";
        moversLines.push(`    ${s.symbol}: ${pctStr(s.changePct)} today ${tag}`);
      });
    }
  }

  // ── Assemble highlights ────────────────────────────────────────────────
  const highlights: string[] = [];

  if (openLines.length > 0) {
    highlights.push("OPEN POSITIONS — current P&L:");
    highlights.push(...openLines);
  } else {
    highlights.push("OPEN POSITIONS: none currently held.");
  }

  if (closedLines.length > 0) {
    highlights.push("CLOSED TRADE HISTORY:");
    highlights.push(...closedLines);
  } else {
    highlights.push("CLOSED TRADE HISTORY: no closed AI-linked trades yet.");
  }

  if (moversLines.length > 0) {
    highlights.push("NOTABLE MOVERS IN YOUR UNIVERSE:");
    highlights.push(...moversLines);
  }

  const summary = closedRows.length === 0
    ? "No closed trades yet — cold start. Use fundamentals, trend quality, and clear downside control as primary filters."
    : "Use this performance data to calibrate your next picks. Double down on patterns that are working; avoid repeating patterns that have lost. Pay special attention to movers you missed.";

  return { summary, highlights };
}
