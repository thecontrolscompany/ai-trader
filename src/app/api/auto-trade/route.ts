import { db } from "@/db";
import { autoTradeLog, autoTradeSettings } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";
import { eq, desc } from "drizzle-orm";
import { newId } from "@/lib/id";
import { NextRequest, NextResponse } from "next/server";

async function getOrCreate(userId: string) {
  try {
    const [existing] = await db.select().from(autoTradeSettings)
      .where(eq(autoTradeSettings.userId, userId)).limit(1);
    if (existing) return existing;
    const [created] = await db.insert(autoTradeSettings)
      .values({ id: newId(), userId }).returning();
    return created;
  } catch (e) {
    throw new Error(`getOrCreate failed for ${userId}: ${e}`);
  }
}

export async function GET() {
  try {
    const result = await getSessionUserId();
    if ("error" in result) return result.error;
    const { userId } = result;

    const settings = await getOrCreate(userId);
    const log = await db.select().from(autoTradeLog)
      .where(eq(autoTradeLog.userId, userId))
      .orderBy(desc(autoTradeLog.createdAt)).limit(50);
    return NextResponse.json({ settings, log });
  } catch (e) {
    console.error("[auto-trade GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const result = await getSessionUserId();
    if ("error" in result) return result.error;
    const { userId } = result;

    await getOrCreate(userId);
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
      .set(updates).where(eq(autoTradeSettings.userId, userId)).returning();
    return NextResponse.json(updated);
  } catch (e) {
    console.error("[auto-trade PATCH]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
