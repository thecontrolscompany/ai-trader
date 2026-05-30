import { db } from "@/db";
import { autoTradeLog, autoTradeSettings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000010";

export async function GET() {
  const [settings] = await db.select().from(autoTradeSettings)
    .where(eq(autoTradeSettings.id, SETTINGS_ID)).limit(1);
  const log = await db.select().from(autoTradeLog)
    .orderBy(desc(autoTradeLog.createdAt)).limit(50);
  return NextResponse.json({ settings, log });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const allowed = ["enabled", "model", "minConfidence", "maxTradesPerDay", "maxPositionPct", "autoClose"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = String(body[key]);
  }
  if (body.minConfidence !== undefined)  updates.minConfidence  = Number(body.minConfidence);
  if (body.maxTradesPerDay !== undefined) updates.maxTradesPerDay = Number(body.maxTradesPerDay);
  if (body.maxPositionPct !== undefined)  updates.maxPositionPct  = Number(body.maxPositionPct);

  const [updated] = await db.update(autoTradeSettings)
    .set(updates).where(eq(autoTradeSettings.id, SETTINGS_ID)).returning();
  return NextResponse.json(updated);
}
