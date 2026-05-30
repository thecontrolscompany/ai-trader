import { db } from "@/db";
import { accounts, trades, transfers } from "@/db/schema";
import { BROKERAGE_ID } from "@/lib/accounts";
import { newId } from "@/lib/id";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [row] = await db.select().from(trades).where(eq(trades.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const [existing] = await db.select().from(trades).where(eq(trades.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Partial<typeof trades.$inferInsert> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.exitPrice !== undefined) updates.exitPrice = Number(body.exitPrice);
  if (body.stopLoss !== undefined) updates.stopLoss = Number(body.stopLoss);
  if (body.takeProfit !== undefined) updates.takeProfit = Number(body.takeProfit);
  if (body.notes !== undefined) updates.notes = body.notes;

  // When closing a trade, return proceeds to brokerage
  if (body.status === "closed" && existing.status === "open" && body.exitPrice != null) {
    updates.closedAt = new Date();
    const proceeds = Number(body.exitPrice) * existing.quantity;
    const [brokerage] = await db.select().from(accounts).where(eq(accounts.id, BROKERAGE_ID)).limit(1);
    const pnl = proceeds - existing.entryPrice * existing.quantity;
    const pnlSign = pnl >= 0 ? "+" : "";

    await Promise.all([
      db.update(accounts)
        .set({ balance: brokerage.balance + proceeds })
        .where(eq(accounts.id, BROKERAGE_ID)),
      db.insert(transfers).values({
        id: newId(),
        fromAccountId: BROKERAGE_ID,
        toAccountId: BROKERAGE_ID,
        amount: proceeds,
        note: `Trade closed: ${existing.ticker} ×${existing.quantity} @ $${Number(body.exitPrice).toFixed(2)} (P&L: ${pnlSign}$${pnl.toFixed(2)})`,
      }),
    ]);
  }

  const [updated] = await db
    .update(trades)
    .set(updates)
    .where(eq(trades.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [existing] = await db.select().from(trades).where(eq(trades.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Refund cost if still open
  if (existing.status === "open") {
    const cost = existing.entryPrice * existing.quantity;
    const [brokerage] = await db.select().from(accounts).where(eq(accounts.id, BROKERAGE_ID)).limit(1);
    await db.update(accounts)
      .set({ balance: brokerage.balance + cost })
      .where(eq(accounts.id, BROKERAGE_ID));
  }

  await db.delete(trades).where(eq(trades.id, id));
  return NextResponse.json({ success: true });
}
