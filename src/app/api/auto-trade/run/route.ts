import { runAutoTrade } from "@/lib/autoTradeEngine";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runAutoTrade();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
