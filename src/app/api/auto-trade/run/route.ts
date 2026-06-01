import { runAutoTradeForPortfolio } from "@/lib/autoTradeEngine";
import { requirePortfolio } from "@/lib/portfolio";
import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST() {
  const r = await requirePortfolio();
  if ("error" in r) return r.error;
  try {
    const result = await runAutoTradeForPortfolio(r.portfolioId, true);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
