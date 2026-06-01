import { auth } from "@/auth";
import { db } from "@/db";
import { portfolios, accounts } from "@/db/schema";
import { newId } from "@/lib/id";
import { and, eq, asc } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Portfolio } from "@/db/schema";

export const COOKIE = "portfolio_id";

/** Get the authenticated user's active portfolio, creating defaults as needed. */
export async function getActivePortfolio(): Promise<Portfolio | null> {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) return null;

  const cookieStore = await cookies();
  const portfolioId = cookieStore.get(COOKIE)?.value;

  if (portfolioId) {
    const [p] = await db.select().from(portfolios)
      .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId))).limit(1);
    if (p) return p;
  }

  // Find or create default portfolio
  const [existing] = await db.select().from(portfolios)
    .where(eq(portfolios.userId, userId))
    .orderBy(asc(portfolios.createdAt)).limit(1);
  if (existing) return existing;

  // First-ever login — create Main paper portfolio + bank/brokerage accounts
  return createPortfolio(userId, "Main", "paper", "alpaca");
}

/** Create a new portfolio + its bank and brokerage accounts. */
export async function createPortfolio(
  userId: string,
  name: string,
  mode: string,
  broker: string,
): Promise<Portfolio> {
  const portfolioId = newId();
  const [portfolio] = await db.insert(portfolios)
    .values({ id: portfolioId, userId, name, mode, broker })
    .returning();

  // Auto-create bank + brokerage accounts for this portfolio
  await db.insert(accounts).values([
    { id: newId(), portfolioId, name: "Bank Account",     type: "bank",      balance: 0 },
    { id: newId(), portfolioId, name: "Brokerage Account", type: "brokerage", balance: 0 },
  ]);

  return portfolio;
}

/** Used by API routes — returns portfolioId + userId or a 401/error response. */
export async function requirePortfolio(): Promise<
  { portfolioId: string; userId: string } | { error: NextResponse }
> {
  const portfolio = await getActivePortfolio();
  if (!portfolio) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { portfolioId: portfolio.id, userId: portfolio.userId };
}

/** Get bank and brokerage account IDs for a portfolio, creating if missing. */
export async function getPortfolioAccountIds(portfolioId: string) {
  const rows = await db.select().from(accounts).where(eq(accounts.portfolioId, portfolioId));
  let bank      = rows.find((r) => r.type === "bank");
  let brokerage = rows.find((r) => r.type === "brokerage");

  if (!bank) {
    const [b] = await db.insert(accounts)
      .values({ id: newId(), portfolioId, name: "Bank Account", type: "bank", balance: 0 })
      .returning();
    bank = b;
  }
  if (!brokerage) {
    const [b] = await db.insert(accounts)
      .values({ id: newId(), portfolioId, name: "Brokerage Account", type: "brokerage", balance: 0 })
      .returning();
    brokerage = b;
  }

  return { bankId: bank.id, brokerageId: brokerage.id };
}
