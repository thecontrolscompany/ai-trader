// Market data provider — Tradier API (developer: delayed quotes; brokerage account: real-time).
// To go live with real-time quotes: fund a Tradier brokerage account and update TRADIER_API_KEY
// with the brokerage account token — no code changes needed.

import type { MarketQuote } from "./types";

async function fetchTradierQuotes(tickers: string[]): Promise<Map<string, MarketQuote>> {
  const token = process.env.TRADIER_API_KEY;
  if (!token) return new Map();

  const symbols = tickers.map((t) => t.toUpperCase()).join(",");

  const res = await fetch(
    `https://api.tradier.com/v1/markets/quotes?symbols=${symbols}&greeks=false`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    }
  );

  if (!res.ok) return new Map();

  const data = await res.json();
  const raw = data?.quotes?.quote;
  if (!raw) return new Map();

  // Tradier returns an object for a single ticker, array for multiple
  const quotes: unknown[] = Array.isArray(raw) ? raw : [raw];

  const map = new Map<string, MarketQuote>();
  for (const item of quotes) {
    const q = item as Record<string, unknown>;
    const sym = q.symbol as string | undefined;
    const price = q.last as number | null;
    if (!sym || price == null) continue;

    const previousClose = (q.prevclose as number) ?? price;
    const change = (q.change as number) ?? price - previousClose;
    const changePct = (q.change_percentage as number) ?? 0;

    map.set(sym, {
      ticker: sym,
      price,
      previousClose,
      change,
      changePct,
      currency: "USD",
      exchangeName: (q.exch as string) ?? "",
      marketState: price != null ? "REGULAR" : "CLOSED",
    });
  }
  return map;
}

export async function getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>> {
  if (tickers.length === 0) return new Map();
  try {
    return await fetchTradierQuotes(tickers);
  } catch {
    return new Map();
  }
}

export async function getQuote(ticker: string): Promise<MarketQuote | null> {
  const map = await getQuotes([ticker]);
  return map.get(ticker.toUpperCase()) ?? null;
}
