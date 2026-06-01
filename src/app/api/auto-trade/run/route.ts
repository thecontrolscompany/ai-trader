import { runAutoTradeForUser } from "@/lib/autoTradeEngine";
import { getSessionUserId } from "@/lib/session";
import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST() {
  const result = await getSessionUserId();
  if ("error" in result) return result.error;
  const { userId } = result;

  try {
    const runResult = await runAutoTradeForUser(userId, true);
    return NextResponse.json(runResult);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
