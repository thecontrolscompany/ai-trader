import { db } from "@/db";
import { autoTradeLog, autoTradeSettings, portfolios } from "@/db/schema";
import { requirePortfolio } from "@/lib/portfolio";
import { newId } from "@/lib/id";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

async function getOrCreate(portfolioId: string) {
  try {
    const [existing] = await db.select().from(autoTradeSettings)
      .where(eq(autoTradeSettings.portfolioId, portfolioId)).limit(1);
    if (existing) return existing;
    const [created] = await db.insert(autoTradeSettings)
      .values({ id: newId(), portfolioId }).returning();
    return created;
  } catch (e) { throw new Error(`getOrCreate failed: ${e}`); }
}

export async function GET() {
  try {
    const r = await requirePortfolio();
    if ("error" in r) return r.error;
    const { portfolioId } = r;
    const [settings, log, portfolioRow] = await Promise.all([
      getOrCreate(portfolioId),
      db.select().from(autoTradeLog)
        .where(eq(autoTradeLog.portfolioId, portfolioId))
        .orderBy(desc(autoTradeLog.createdAt)).limit(50),
      db.select({ name: portfolios.name }).from(portfolios)
        .where(eq(portfolios.id, portfolioId)).limit(1),
    ]);
    return NextResponse.json({ settings, log, portfolioName: portfolioRow[0]?.name ?? null });
  } catch (e) {
    console.error("[auto-trade GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const r = await requirePortfolio();
    if ("error" in r) return r.error;
    const { portfolioId } = r;
    await getOrCreate(portfolioId);
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
      .set(updates).where(eq(autoTradeSettings.portfolioId, portfolioId)).returning();
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
