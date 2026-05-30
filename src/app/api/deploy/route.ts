/**
 * Deploy Capital — two-step endpoint.
 *
 * POST { action: "preview", model: "openai"|"claude" }
 *   → runs AI scan, returns allocation plan (does NOT open trades yet)
 *
 * POST { action: "execute", picks: [...] }
 *   → opens all trades from the previewed plan, deducts from brokerage
 */
import { db } from "@/db";
import { accounts, trades } from "@/db/schema";
import { BROKERAGE_ID } from "@/lib/accounts";
import { calcBuyFees } from "@/lib/fees";
import { fetchTopStocks } from "@/lib/fetchStocks";
import { saveScanSignals } from "@/lib/roiTracker";
import { callClaude, callOpenAI } from "@/lib/scanHelpers";
import { calcShares } from "@/lib/shares";
import { newId } from "@/lib/id";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export interface DeployPick {
  symbol: string;
  name: string;
  direction: "long" | "short";
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  riskLevel: string;
  reasoning: string;
  invest: number;   // dollar amount to invest
  shares: number;   // calculated shares
  signalId?: string | null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // ── PREVIEW: run scan + plan allocation ───────────────────────────────
  if (body.action === "preview") {
    const model = body.model ?? "openai";

    // Get current brokerage balance
    const [brokerage] = await db.select().from(accounts)
      .where(eq(accounts.id, BROKERAGE_ID)).limit(1);
    const balance = brokerage?.balance ?? 0;

    if (balance < 1) {
      return NextResponse.json(
        { error: "Brokerage balance is $0. Deposit funds first." },
        { status: 400 }
      );
    }

    // Get already-open tickers so we don't double-up
    const openRows = await db.select().from(trades).where(eq(trades.status, "open"));
    const openTickers = new Set(openRows.map((t) => t.ticker));

    // Run AI scan
    const stocks = await fetchTopStocks();
    const raw = model === "claude"
      ? await callClaude(stocks)
      : await callOpenAI(stocks);

    const normalized = ((raw.picks ?? []) as any[])
      .map((p) => ({
        symbol: String(p.symbol ?? ""),
        name: String(p.name ?? p.symbol ?? ""),
        direction: (p.direction as "long" | "short" | "neutral") ?? "long",
        entryZoneLow: Number(p.entryZoneLow ?? 0),
        entryZoneHigh: Number(p.entryZoneHigh ?? p.entryZoneLow ?? 0),
        targetPrice: Number(p.targetPrice ?? 0),
        stopLoss: Number(p.stopLoss ?? 0),
        timeHorizon: String(p.timeHorizon ?? "unknown"),
        confidence: Number(p.confidence ?? 0.5),
        reasoning: String(p.reasoning ?? ""),
        riskLevel: String(p.riskLevel ?? "moderate"),
      }))
      .filter((p) => p.symbol && p.entryZoneLow > 0);

    const saved = await saveScanSignals(normalized, raw.model ?? model, raw.estimatedCostUsd ?? 0);

    // Filter to actionable picks
    const qualifying = saved.filter((p) => {
      if (!p.symbol || !p.entryZoneLow) return false;
      if (openTickers.has(String(p.symbol))) return false;
      if (Number(p.confidence ?? 0) < 0.60) return false;
      return true;
    }).slice(0, 10); // cap at 10 positions

    if (qualifying.length === 0) {
      return NextResponse.json(
        { error: "No qualifying picks found. Try again or lower your confidence threshold." },
        { status: 400 }
      );
    }

    // Divide balance evenly
    const perSlot = balance / qualifying.length;

    const picks: DeployPick[] = qualifying.map((p) => {
      const entryPrice = Number(p.entryZoneLow);
      const invest = Math.floor(perSlot * 100) / 100; // round down to cents
      const shares = calcShares(invest, entryPrice);
      return {
        symbol: String(p.symbol),
        name: String(p.name ?? p.symbol),
        direction: p.direction === "short" ? "short" : "long",
        entryPrice,
        targetPrice: Number(p.targetPrice ?? entryPrice * 1.1),
        stopLoss: Number(p.stopLoss ?? entryPrice * 0.95),
        confidence: Number(p.confidence ?? 0.7),
        riskLevel: String(p.riskLevel ?? "moderate"),
        reasoning: String(p.reasoning ?? "").slice(0, 300),
        invest,
        shares: Math.round(shares * 10000) / 10000,
        signalId: p.signalId ?? null,
      };
    });

    return NextResponse.json({
      balance,
      totalInvest: picks.reduce((s, p) => s + p.invest, 0),
      picks,
      model: raw.model ?? model,
      summary: raw.summary ?? "",
    });
  }

  // ── EXECUTE: open all trades from previewed plan ──────────────────────
  if (body.action === "execute") {
    const picks: DeployPick[] = body.picks ?? [];
    if (!picks.length) {
      return NextResponse.json({ error: "No picks provided" }, { status: 400 });
    }

    // Re-fetch balance to be safe
    const [brokerage] = await db.select().from(accounts)
      .where(eq(accounts.id, BROKERAGE_ID)).limit(1);
    let balance = brokerage?.balance ?? 0;

    const opened: string[] = [];
    const errors: string[] = [];

    // Fetch actual current prices for all tickers in parallel so entry price
    // matches the real market price — avoids phantom P&L on open
    const priceMap: Record<string, number> = {};
    await Promise.all(
      picks.map(async (p) => {
        try {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${p.symbol}`,
            { headers: { "User-Agent": "Mozilla/5.0" } }
          );
          const j = await r.json();
          const price = j?.quoteResponse?.result?.[0]?.regularMarketPrice;
          if (price) priceMap[p.symbol] = Number(price);
        } catch { /* fall back to AI suggested price */ }
      })
    );

    for (const pick of picks) {
      if (balance < pick.invest) {
        errors.push(`${pick.symbol}: insufficient funds ($${balance.toFixed(2)} left)`);
        continue;
      }
      try {
        const fees = calcBuyFees();
        // Use real current price as entry; fall back to AI suggested if unavailable
        const actualEntry = priceMap[pick.symbol] ?? pick.entryPrice;
        const actualShares = calcShares(pick.invest, actualEntry);
        await db.insert(trades).values({
          id: newId(),
          ticker: pick.symbol,
          assetClass: "stock",
          direction: pick.direction,
          status: "open",
          entryPrice: actualEntry,
          quantity: actualShares,
          stopLoss: pick.stopLoss,
          takeProfit: pick.targetPrice,
          fees,
          notes: `[DEPLOY] ${pick.reasoning}`,
          aiSignalId: pick.signalId ?? null,
        });
        balance -= pick.invest;
        opened.push(pick.symbol);
      } catch (e) {
        errors.push(`${pick.symbol}: ${e}`);
      }
    }

    // Update brokerage balance
    await db.update(accounts).set({ balance }).where(eq(accounts.id, BROKERAGE_ID));

    return NextResponse.json({ opened, errors, remainingBalance: balance });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
