import { db } from "@/db";
import { accounts, transfers } from "@/db/schema";
import { requirePortfolio, getPortfolioAccountIds } from "@/lib/portfolio";
import { newId } from "@/lib/id";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const r = await requirePortfolio();
  if ("error" in r) return r.error;
  const { portfolioId } = r;

  await getPortfolioAccountIds(portfolioId); // ensure accounts exist
  const [accts, recentTransfers] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.portfolioId, portfolioId)),
    db.select().from(transfers).where(eq(transfers.portfolioId, portfolioId))
      .orderBy(desc(transfers.createdAt)).limit(50),
  ]);
  return NextResponse.json({ accounts: accts, transfers: recentTransfers });
}

export async function POST(req: NextRequest) {
  const r = await requirePortfolio();
  if ("error" in r) return r.error;
  const { portfolioId } = r;

  const body = await req.json();
  const { action, amount, note } = body;
  if (!amount || Number(amount) <= 0)
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
  const amt = Number(amount);

  const { bankId, brokerageId } = await getPortfolioAccountIds(portfolioId);

  if (action === "deposit") {
    const [bank] = await db.select().from(accounts).where(eq(accounts.id, bankId)).limit(1);
    await db.update(accounts).set({ balance: bank.balance + amt }).where(eq(accounts.id, bankId));
    await db.insert(transfers).values({ id: newId(), portfolioId, fromAccountId: bankId, toAccountId: bankId, amount: amt, note: note ?? "Cash deposit" });
    return NextResponse.json({ success: true });
  }

  if (action === "transfer") {
    const { direction } = body;
    const fromId = direction === "to_brokerage" ? bankId : brokerageId;
    const toId   = direction === "to_brokerage" ? brokerageId : bankId;
    const [fromAcct] = await db.select().from(accounts).where(eq(accounts.id, fromId)).limit(1);
    if (fromAcct.balance < amt)
      return NextResponse.json({ error: `Insufficient funds — ${fromAcct.name} has $${fromAcct.balance.toFixed(2)}` }, { status: 400 });
    const [toAcct] = await db.select().from(accounts).where(eq(accounts.id, toId)).limit(1);
    await Promise.all([
      db.update(accounts).set({ balance: fromAcct.balance - amt }).where(eq(accounts.id, fromId)),
      db.update(accounts).set({ balance: toAcct.balance + amt }).where(eq(accounts.id, toId)),
      db.insert(transfers).values({ id: newId(), portfolioId, fromAccountId: fromId, toAccountId: toId, amount: amt, note: note ?? `Transfer ${direction === "to_brokerage" ? "to Brokerage" : "to Bank"}` }),
    ]);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
