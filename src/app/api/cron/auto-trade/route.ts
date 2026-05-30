import { runAutoTrade } from "@/lib/autoTradeEngine";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

// Vercel calls this on schedule — protected by CRON_SECRET
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runAutoTrade();
  return NextResponse.json(result);
}
