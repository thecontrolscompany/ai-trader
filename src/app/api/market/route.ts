import { NextRequest, NextResponse } from "next/server";

// Uses Yahoo Finance v7 quote endpoint — same API used when opening trades,
// ensuring currentPrice === entryPrice immediately after buying (zero phantom P&L).
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker param required" }, { status: 400 });
  }

  const symbol = ticker.toUpperCase();

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 60 },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance returned ${res.status} for ${symbol}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const quote = data?.quoteResponse?.result?.[0];

    if (!quote) {
      return NextResponse.json(
        { error: `No data found for ${symbol}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ticker: symbol,
      price: quote.regularMarketPrice,
      previousClose: quote.regularMarketPreviousClose,
      change: quote.regularMarketChange,
      changePct: quote.regularMarketChangePercent,
      currency: quote.currency,
      exchangeName: quote.exchangeName,
      marketState: quote.marketState,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}
