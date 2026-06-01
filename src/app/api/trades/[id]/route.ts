import { db } from "@/db";
import { accounts, trades, transfers } from "@/db/schema";
import { requirePortfolio, getPortfolioAccountIds } from "@/lib/portfolio";
import { calcSellFees } from "@/lib/fees";
import { newId } from "@/lib/id";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requirePortfolio();
  if ("error" in r) return r.error;
  const { id } = await params;
  const [row] = await db.select().from(trades).where(and(eq(trades.id, id), eq(trades.portfolioId, r.portfolioId))).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requirePortfolio();
  if ("error" in r) return r.error;
  const { portfolioId } = r;
  const { id } = await params;
  const body = await req.json();

  const [existing] = await db.select().from(trades).where(and(eq(trades.id, id), eq(trades.portfolioId, portfolioId))).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Partial<typeof trades.$inferInsert> = {};
  if (body.status !== undefined)    updates.status    = body.status;
  if (body.exitPrice !== undefined) updates.exitPrice = Number(body.exitPrice);
  if (body.stopLoss !== undefined)  updates.stopLoss  = Number(body.stopLoss);
  if (body.takeProfit !== undefined) updates.takeProfit = Number(body.takeProfit);
  if (body.notes !== undefined)     updates.notes     = body.notes;

  if (body.status === "closed" && existing.status === "open" && body.exitPrice != null) {
    updates.closedAt = new Date();
    const exitPrice = Number(body.exitPrice);
    const sellFees  = calcSellFees(exitPrice, existing.quantity);
    const netProceeds = exitPrice * existing.quantity - sellFees;
    const pnl = netProceeds - existing.entryPrice * existing.quantity;
    updates.fees = (existing.fees ?? 0) + sellFees;
    const { brokerageId } = await getPortfolioAccountIds(portfolioId);
    const [brokerage] = await db.select().from(accounts).where(eq(accounts.id, brokerageId)).limit(1);
    await Promise.all([
      db.update(accounts).set({ balance: brokerage.balance + netProceeds }).where(eq(accounts.id, brokerageId)),
      db.insert(transfers).values({ id: newId(), portfolioId, fromAccountId: brokerageId, toAccountId: brokerageId, amount: netProceeds, note: `Trade closed: ${existing.ticker} ×${existing.quantity} @ $${exitPrice.toFixed(2)} — fees: $${sellFees.toFixed(2)} — P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` }),
    ]);
  }

  const [updated] = await db.update(trades).set(updates).where(and(eq(trades.id, id), eq(trades.portfolioId, portfolioId))).returning();
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requirePortfolio();
  if ("error" in r) return r.error;
  const { portfolioId } = r;
  const { id } = await params;
  const [existing] = await db.select().from(trades).where(and(eq(trades.id, id), eq(trades.portfolioId, portfolioId))).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "open") {
    const { brokerageId } = await getPortfolioAccountIds(portfolioId);
    const [brokerage] = await db.select().from(accounts).where(eq(accounts.id, brokerageId)).limit(1);
    await db.update(accounts).set({ balance: brokerage.balance + existing.entryPrice * existing.quantity }).where(eq(accounts.id, brokerageId));
  }
  await db.delete(trades).where(and(eq(trades.id, id), eq(trades.portfolioId, portfolioId)));
  return NextResponse.json({ success: true });
}
