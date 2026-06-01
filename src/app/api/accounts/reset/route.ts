import { db } from "@/db";
import { accounts, aiSignals, autoTradeLog, autoTradeSettings, trades, transfers } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST() {
  const result = await getSessionUserId();
  if ("error" in result) return result.error;
  const { userId } = result;

  // Delete in FK-safe order, scoped to this user only
  await db.delete(autoTradeLog).where(eq(autoTradeLog.userId, userId));
  await db.delete(transfers).where(eq(transfers.userId, userId));
  await db.delete(trades).where(eq(trades.userId, userId));
  // Keep ai_signals — they're shared reference data, not user-specific

  await db.update(accounts).set({ balance: 0 }).where(eq(accounts.userId, userId));
  await db.update(autoTradeSettings).set({ lastRunAt: null, lastRunSummary: null })
    .where(eq(autoTradeSettings.userId, userId));

  return NextResponse.json({ success: true });
}
