import { db } from "@/db";
import { accounts, transfers } from "@/db/schema";
import { BANK_ID, BROKERAGE_ID } from "@/lib/accounts";
import { newId } from "@/lib/id";
import { eq, desc, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const [accts, recentTransfers] = await Promise.all([
    db.select().from(accounts),
    db.select().from(transfers)
      .orderBy(desc(transfers.createdAt))
      .limit(50),
  ]);
  return NextResponse.json({ accounts: accts, transfers: recentTransfers });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, amount, note } = body;

  if (!amount || Number(amount) <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
  }
  const amt = Number(amount);

  // ── Deposit: add cash to bank account ────────────────────────────────────
  if (action === "deposit") {
    const [bank] = await db.select().from(accounts).where(eq(accounts.id, BANK_ID)).limit(1);
    await db.update(accounts).set({ balance: bank.balance + amt }).where(eq(accounts.id, BANK_ID));
    await db.insert(transfers).values({
      id: newId(),
      fromAccountId: BANK_ID,
      toAccountId: BANK_ID,
      amount: amt,
      note: note ?? "Cash deposit",
    });
    return NextResponse.json({ success: true });
  }

  // ── Transfer: move between bank ↔ brokerage ───────────────────────────────
  if (action === "transfer") {
    const { direction } = body; // "to_brokerage" | "to_bank"
    const fromId = direction === "to_brokerage" ? BANK_ID : BROKERAGE_ID;
    const toId   = direction === "to_brokerage" ? BROKERAGE_ID : BANK_ID;

    const [fromAcct] = await db.select().from(accounts).where(eq(accounts.id, fromId)).limit(1);
    if (fromAcct.balance < amt) {
      return NextResponse.json(
        { error: `Insufficient funds — ${fromAcct.name} has $${fromAcct.balance.toFixed(2)}` },
        { status: 400 }
      );
    }
    const [toAcct] = await db.select().from(accounts).where(eq(accounts.id, toId)).limit(1);

    await Promise.all([
      db.update(accounts).set({ balance: fromAcct.balance - amt }).where(eq(accounts.id, fromId)),
      db.update(accounts).set({ balance: toAcct.balance + amt }).where(eq(accounts.id, toId)),
      db.insert(transfers).values({
        id: newId(),
        fromAccountId: fromId,
        toAccountId: toId,
        amount: amt,
        note: note ?? `Transfer ${direction === "to_brokerage" ? "to Brokerage" : "to Bank"}`,
      }),
    ]);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
