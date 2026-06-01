import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/marketProvider";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker param required" }, { status: 400 });
  }

  const quote = await getQuote(ticker);
  if (!quote) {
    return NextResponse.json(
      { error: `No data found for ${ticker.toUpperCase()}` },
      { status: 404 }
    );
  }

  return NextResponse.json(quote);
}
