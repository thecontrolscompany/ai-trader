import { db } from "@/db";
import { trades } from "@/db/schema";
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

  if (body.status === "closed" && !updates.closedAt) {
    updates.closedAt = new Date();
  }

  const updated = await db
    .update(trades)
    .set(updates)
    .where(eq(trades.id, id))
    .returning();

  return NextResponse.json(updated[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [existing] = await db.select().from(trades).where(eq(trades.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(trades).where(eq(trades.id, id));
  return NextResponse.json({ success: true });
}
