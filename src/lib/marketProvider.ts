// Market data provider — swap fetchYahooQuotes for fetchTradierQuotes when going live.
// Tradier endpoint: GET https://api.tradier.com/v1/markets/quotes?symbols=AAPL,MSFT
// Headers: Authorization: Bearer <TRADIER_API_KEY>, Accept: application/json
// The response shape differs; update the mapping in fetchTradierQuotes accordingly.

import type { MarketQuote } from "./types";

async function fetchYahooQuotes(tickers: string[]): Promise<Map<string, MarketQuote>> {
  const symbols = tickers.map((t) => t.toUpperCase()).join(",");

  const res = await fetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 60 },
    }
  );

  if (!res.ok) return new Map();

  const data = await res.json();
  const results: unknown[] = data?.quoteResponse?.result ?? [];

  const map = new Map<string, MarketQuote>();
  for (const item of results) {
    const q = item as Record<string, unknown>;
    const sym = q.symbol as string | undefined;
    if (!sym || typeof q.regularMarketPrice !== "number") continue;
    map.set(sym, {
      ticker: sym,
      price: q.regularMarketPrice,
      previousClose: (q.regularMarketPreviousClose as number) ?? 0,
      change: (q.regularMarketChange as number) ?? 0,
      changePct: (q.regularMarketChangePercent as number) ?? 0,
      currency: (q.currency as string) ?? "USD",
      exchangeName: (q.exchangeName as string) ?? "",
      marketState: (q.marketState as string) ?? "",
    });
  }
  return map;
}

export async function getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>> {
  if (tickers.length === 0) return new Map();
  try {
    return await fetchYahooQuotes(tickers);
  } catch {
    return new Map();
  }
}

export async function getQuote(ticker: string): Promise<MarketQuote | null> {
  const map = await getQuotes([ticker]);
  return map.get(ticker.toUpperCase()) ?? null;
}
