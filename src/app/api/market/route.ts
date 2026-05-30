import { NextRequest, NextResponse } from "next/server";

// Uses Yahoo Finance v8 chart endpoint — no API key required for delayed quotes
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker param required" }, { status: 400 });
  }

  const symbol = ticker.toUpperCase();

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 60 }, // cache 60s
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance returned ${res.status} for ${symbol}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta) {
      return NextResponse.json(
        { error: `No data found for ${symbol}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ticker: symbol,
      price: meta.regularMarketPrice ?? meta.previousClose,
      previousClose: meta.previousClose,
      currency: meta.currency,
      exchangeName: meta.exchangeName,
      marketState: meta.marketState,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}
