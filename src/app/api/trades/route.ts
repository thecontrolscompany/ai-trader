import { db } from "@/db";
import { trades } from "@/db/schema";
import { newId } from "@/lib/id";
import { desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(trades).orderBy(desc(trades.openedAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    ticker,
    assetClass = "stock",
    direction,
    entryPrice,
    quantity,
    stopLoss,
    takeProfit,
    notes,
    aiSignalId,
  } = body;

  if (!ticker || !direction || entryPrice == null || quantity == null) {
    return NextResponse.json(
      { error: "ticker, direction, entryPrice, and quantity are required" },
      { status: 400 }
    );
  }

  const trade = await db
    .insert(trades)
    .values({
      id: newId(),
      ticker: ticker.toUpperCase(),
      assetClass,
      direction,
      entryPrice: Number(entryPrice),
      quantity: Number(quantity),
      stopLoss: stopLoss != null ? Number(stopLoss) : null,
      takeProfit: takeProfit != null ? Number(takeProfit) : null,
      notes: notes ?? null,
      aiSignalId: aiSignalId ?? null,
    })
    .returning();

  return NextResponse.json(trade[0], { status: 201 });
}
