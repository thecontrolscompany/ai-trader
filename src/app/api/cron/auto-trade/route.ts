import { runAutoTradeForAllPortfolios } from "@/lib/autoTradeEngine";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await runAutoTradeForAllPortfolios();
  return NextResponse.json(results);
}
