import { db } from "@/db";
import { accounts, autoTradeLog, autoTradeSettings, trades, transfers } from "@/db/schema";
import { requirePortfolio } from "@/lib/portfolio";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST() {
  const r = await requirePortfolio();
  if ("error" in r) return r.error;
  const { portfolioId } = r;

  await db.delete(autoTradeLog).where(eq(autoTradeLog.portfolioId, portfolioId));
  await db.delete(transfers).where(eq(transfers.portfolioId, portfolioId));
  await db.delete(trades).where(eq(trades.portfolioId, portfolioId));
  await db.update(accounts).set({ balance: 0 }).where(eq(accounts.portfolioId, portfolioId));
  await db.update(autoTradeSettings).set({ lastRunAt: null, lastRunSummary: null })
    .where(eq(autoTradeSettings.portfolioId, portfolioId));

  return NextResponse.json({ success: true });
}
