import { db } from "@/db";
import { accounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { newId } from "@/lib/id";

export interface UserAccountIds {
  bankId: string;
  brokerageId: string;
}

/**
 * Returns the bank and brokerage account IDs for a user,
 * creating them automatically if this is their first time.
 */
export async function getUserAccountIds(userId: string): Promise<UserAccountIds> {
  const rows = await db.select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const bank      = rows.find((r) => r.type === "bank");
  const brokerage = rows.find((r) => r.type === "brokerage");

  const bankId      = bank?.id      ?? await createAccount(userId, "Bank Account",      "bank");
  const brokerageId = brokerage?.id ?? await createAccount(userId, "Brokerage Account", "brokerage");

  return { bankId, brokerageId };
}

async function createAccount(userId: string, name: string, type: "bank" | "brokerage"): Promise<string> {
  const id = newId();
  await db.insert(accounts).values({ id, userId, name, type, balance: 0 });
  return id;
}

// Legacy helper — resolves brokerage ID for a given user (used in trade routes)
export async function getBrokerageId(userId: string): Promise<string> {
  const { brokerageId } = await getUserAccountIds(userId);
  return brokerageId;
}

export async function getBankId(userId: string): Promise<string> {
  const { bankId } = await getUserAccountIds(userId);
  return bankId;
}
