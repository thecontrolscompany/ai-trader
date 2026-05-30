import { runAutoTrade } from "@/lib/autoTradeEngine";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST() {
  try {
    // force=true bypasses the market hours check for manual runs
    const result = await runAutoTrade(true);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
