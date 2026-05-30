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
import { callClaude, callOpenAI } from "@/lib/scanHelpers";
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

    // Filter to actionable picks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qualifying = ((raw.picks ?? []) as any[]).filter((p) => {
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
      const shares = invest / entryPrice;
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

    for (const pick of picks) {
      if (balance < pick.invest) {
        errors.push(`${pick.symbol}: insufficient funds ($${balance.toFixed(2)} left)`);
        continue;
      }
      try {
        const fees = calcBuyFees();
        await db.insert(trades).values({
          id: newId(),
          ticker: pick.symbol,
          assetClass: "stock",
          direction: pick.direction,
          status: "open",
          entryPrice: pick.entryPrice,
          quantity: pick.shares,
          stopLoss: pick.stopLoss,
          takeProfit: pick.targetPrice,
          fees,
          notes: `[DEPLOY] ${pick.reasoning}`,
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
