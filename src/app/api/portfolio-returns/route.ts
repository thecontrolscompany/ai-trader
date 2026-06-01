import { db } from "@/db";
import { portfolioSnapshots, accounts, trades } from "@/db/schema";
import { requirePortfolio } from "@/lib/portfolio";
import { getQuotes } from "@/lib/marketProvider";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function daysAgoET(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export async function GET() {
  const r = await requirePortfolio();
  if ("error" in r) return r.error;
  const { portfolioId } = r;

  const [allAccounts, openTrades, snapshots] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.portfolioId, portfolioId)),
    db.select().from(trades).where(eq(trades.portfolioId, portfolioId)),
    db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.portfolioId, portfolioId)),
  ]);

  const openOnly = openTrades.filter(t => t.status === "open");
  const tickers = [...new Set(openOnly.map(t => t.ticker))];
  const quotes = await getQuotes(tickers);

  const cash = allAccounts.reduce((s, a) => s + a.balance, 0);
  const invested = openOnly.reduce((s, t) => {
    const price = quotes.get(t.ticker)?.price ?? t.entryPrice;
    return s + price * t.quantity;
  }, 0);
  const totalValue = cash + invested;

  // Upsert today's snapshot — non-fatal if it fails
  const today = todayET();
  db.insert(portfolioSnapshots)
    .values({ portfolioId, date: today, totalValue })
    .onConflictDoUpdate({
      target: [portfolioSnapshots.portfolioId, portfolioSnapshots.date],
      set: { totalValue, updatedAt: new Date() },
    })
    .catch(() => {});

  function getPct(daysAgo: number): number | null {
    const cutoff = daysAgoET(daysAgo);
    const past = snapshots
      .filter(s => s.date <= cutoff)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!past || past.totalValue === 0) return null;
    return ((totalValue - past.totalValue) / past.totalValue) * 100;
  }

  return NextResponse.json({
    totalValue,
    day:   getPct(1),
    week:  getPct(7),
    month: getPct(30),
    year:  getPct(365),
  });
}
