import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { createPortfolio, getActivePortfolio } from "@/lib/portfolio";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await getActivePortfolio();
  const all = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  return NextResponse.json({ portfolios: all, activeId: active?.id ?? null });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, mode = "paper", broker = "alpaca" } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const portfolio = await createPortfolio(userId, name.trim(), mode, broker);
  return NextResponse.json(portfolio, { status: 201 });
}
