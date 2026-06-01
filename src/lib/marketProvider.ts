// Market data provider — swap fetchYahooV8Quote for fetchTradierQuote when going live.
// Tradier endpoint: GET https://api.tradier.com/v1/markets/quotes?symbols=AAPL,MSFT
// Headers: Authorization: Bearer <TRADIER_API_KEY>, Accept: application/json
// The response shape differs; update the mapping in a fetchTradierQuotes function accordingly.

import type { MarketQuote } from "./types";

// Yahoo Finance v8 chart endpoint — works without authentication (v7 requires a crumb/cookie).
// One request per ticker; parallel fetches via getQuotes.
async function fetchYahooV8Quote(ticker: string): Promise<MarketQuote | null> {
  const sym = ticker.toUpperCase();
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 60 },
    }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") return null;

  const price = meta.regularMarketPrice as number;
  const previousClose = (meta.chartPreviousClose ?? meta.previousClose ?? price) as number;
  const change = price - previousClose;
  const changePct = previousClose > 0 ? (change / previousClose) * 100 : 0;

  return {
    ticker: sym,
    price,
    previousClose,
    change,
    changePct,
    currency: (meta.currency as string) ?? "USD",
    exchangeName: (meta.exchangeName as string) ?? "",
    marketState: (meta.marketState as string) ?? "",
  };
}

export async function getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>> {
  if (tickers.length === 0) return new Map();
  try {
    const results = await Promise.allSettled(tickers.map((t) => fetchYahooV8Quote(t)));
    const map = new Map<string, MarketQuote>();
    results.forEach((result, i) => {
      if (result.status === "fulfilled" && result.value) {
        map.set(tickers[i].toUpperCase(), result.value);
      }
    });
    return map;
  } catch {
    return new Map();
  }
}

export async function getQuote(ticker: string): Promise<MarketQuote | null> {
  const map = await getQuotes([ticker]);
  return map.get(ticker.toUpperCase()) ?? null;
}
