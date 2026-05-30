import { db } from "@/db";
import { accounts, trades, transfers } from "@/db/schema";
import { BROKERAGE_ID } from "@/lib/accounts";
import { calcBuyFees } from "@/lib/fees";
import { newId } from "@/lib/id";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(trades).orderBy(desc(trades.openedAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    ticker, assetClass = "stock", direction,
    entryPrice, quantity, stopLoss, takeProfit, notes, aiSignalId,
  } = body;

  if (!ticker || !direction || entryPrice == null || quantity == null) {
    return NextResponse.json(
      { error: "ticker, direction, entryPrice, and quantity are required" },
      { status: 400 }
    );
  }

  const buyFees = calcBuyFees();
  const cost = Number(entryPrice) * Number(quantity) + buyFees;

  // Check brokerage has enough cash
  const [brokerage] = await db.select().from(accounts).where(eq(accounts.id, BROKERAGE_ID)).limit(1);
  if (!brokerage || brokerage.balance < cost) {
    return NextResponse.json(
      {
        error: `Insufficient brokerage funds. Need $${cost.toFixed(2)}, have $${(brokerage?.balance ?? 0).toFixed(2)}. Transfer funds from your Bank Account first.`,
      },
      { status: 400 }
    );
  }

  // Deduct cost from brokerage + record as transfer to self (trade hold)
  const tradeId = newId();
  await Promise.all([
    db.update(accounts)
      .set({ balance: brokerage.balance - cost })
      .where(eq(accounts.id, BROKERAGE_ID)),
    db.insert(transfers).values({
      id: newId(),
      fromAccountId: BROKERAGE_ID,
      toAccountId: BROKERAGE_ID,
      amount: cost,
      note: `Trade opened: ${ticker.toUpperCase()} ×${quantity} @ $${Number(entryPrice).toFixed(2)} (fees: $${buyFees.toFixed(2)})`,
    }),
  ]);

  const [trade] = await db
    .insert(trades)
    .values({
      id: tradeId,
      ticker: ticker.toUpperCase(),
      assetClass,
      direction,
      entryPrice: Number(entryPrice),
      quantity: Number(quantity),
      stopLoss: stopLoss != null ? Number(stopLoss) : null,
      takeProfit: takeProfit != null ? Number(takeProfit) : null,
      notes: notes ?? null,
      aiSignalId: aiSignalId ?? null,
      fees: buyFees,
    })
    .returning();

  return NextResponse.json(trade, { status: 201 });
}
