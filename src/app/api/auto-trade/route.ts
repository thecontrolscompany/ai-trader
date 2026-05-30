import { db } from "@/db";
import { autoTradeLog, autoTradeSettings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000010";

async function getOrCreateSettings() {
  const [existing] = await db.select().from(autoTradeSettings)
    .where(eq(autoTradeSettings.id, SETTINGS_ID)).limit(1);
  if (existing) return existing;

  // Row missing — create it with defaults
  const [created] = await db.insert(autoTradeSettings)
    .values({ id: SETTINGS_ID })
    .returning();
  return created;
}

export async function GET() {
  const settings = await getOrCreateSettings();
  const log = await db.select().from(autoTradeLog)
    .orderBy(desc(autoTradeLog.createdAt)).limit(50);
  return NextResponse.json({ settings, log });
}

export async function PATCH(req: NextRequest) {
  await getOrCreateSettings(); // ensure row exists
  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.enabled !== undefined)         updates.enabled         = String(body.enabled);
  if (body.model !== undefined)           updates.model           = String(body.model);
  if (body.autoClose !== undefined)       updates.autoClose       = String(body.autoClose);
  if (body.scanFrequency !== undefined)   updates.scanFrequency   = String(body.scanFrequency);
  if (body.deployMode !== undefined)      updates.deployMode      = String(body.deployMode);
  if (body.minConfidence !== undefined)   updates.minConfidence   = Number(body.minConfidence);
  if (body.maxTradesPerDay !== undefined) updates.maxTradesPerDay = Number(body.maxTradesPerDay);
  if (body.maxPositionPct !== undefined)  updates.maxPositionPct  = Number(body.maxPositionPct);

  const [updated] = await db.update(autoTradeSettings)
    .set(updates).where(eq(autoTradeSettings.id, SETTINGS_ID)).returning();
  return NextResponse.json(updated);
}
