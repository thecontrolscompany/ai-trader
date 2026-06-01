import { db } from "@/db";
import { accounts, trades, transfers } from "@/db/schema";
import { requirePortfolio, getPortfolioAccountIds } from "@/lib/portfolio";
import { calcBuyFees } from "@/lib/fees";
import { newId } from "@/lib/id";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const r = await requirePortfolio();
  if ("error" in r) return r.error;
  const { portfolioId } = r;
  const rows = await db.select().from(trades).where(eq(trades.portfolioId, portfolioId)).orderBy(desc(trades.openedAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const r = await requirePortfolio();
  if ("error" in r) return r.error;
  const { portfolioId } = r;

  const body = await req.json();
  const { ticker, assetClass = "stock", direction, entryPrice, quantity, stopLoss, takeProfit, notes, aiSignalId } = body;
  if (!ticker || !direction || entryPrice == null || quantity == null)
    return NextResponse.json({ error: "ticker, direction, entryPrice, and quantity are required" }, { status: 400 });

  const { brokerageId } = await getPortfolioAccountIds(portfolioId);
  const cost = Number(entryPrice) * Number(quantity) + calcBuyFees();
  const [brokerage] = await db.select().from(accounts).where(eq(accounts.id, brokerageId)).limit(1);
  if (!brokerage || brokerage.balance < cost)
    return NextResponse.json({ error: `Insufficient brokerage funds. Need $${cost.toFixed(2)}, have $${(brokerage?.balance ?? 0).toFixed(2)}.` }, { status: 400 });

  await Promise.all([
    db.update(accounts).set({ balance: brokerage.balance - cost }).where(eq(accounts.id, brokerageId)),
    db.insert(transfers).values({ id: newId(), portfolioId, fromAccountId: brokerageId, toAccountId: brokerageId, amount: cost, note: `Trade opened: ${ticker.toUpperCase()} ×${quantity} @ $${Number(entryPrice).toFixed(2)}` }),
  ]);

  const [trade] = await db.insert(trades).values({
    id: newId(), portfolioId, ticker: ticker.toUpperCase(), assetClass, direction,
    entryPrice: Number(entryPrice), quantity: Number(quantity),
    stopLoss: stopLoss != null ? Number(stopLoss) : null,
    takeProfit: takeProfit != null ? Number(takeProfit) : null,
    notes: notes ?? null, aiSignalId: aiSignalId ?? null, fees: 0,
  }).returning();
  return NextResponse.json(trade, { status: 201 });
}
