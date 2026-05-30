import { db } from "@/db";
import { accounts, aiSignals, autoTradeLog, autoTradeSettings, trades, transfers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

// Paper trading reset — clears all simulated trades, history, and balances.
// Has no effect on real money. This is purely a paper trading tool.
export async function POST() {
  try {
    // Delete in FK-safe order
    await db.delete(autoTradeLog);
    await db.delete(transfers);
    await db.delete(trades);
    await db.delete(aiSignals);

    // Zero out balances
    await db.update(accounts).set({ balance: 0 });

    // Clear auto-trade last run info
    await db.update(autoTradeSettings).set({
      lastRunAt: null,
      lastRunSummary: null,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
