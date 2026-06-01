import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { COOKIE } from "@/lib/portfolio";
import { auth } from "@/auth";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { portfolioId } = await req.json();
  const [portfolio] = await db.select().from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId))).limit(1);
  if (!portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });

  const res = NextResponse.json({ success: true, portfolio });
  res.cookies.set(COOKIE, portfolioId, { path: "/", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  return res;
}
