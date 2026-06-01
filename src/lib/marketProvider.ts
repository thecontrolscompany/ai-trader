// Market data provider.
// Primary: Tradier (developer = 15-min delayed; brokerage account = real-time).
// Fallback: Yahoo Finance v8 (no auth required, used if Tradier returns no data).
// To go live: fund a Tradier brokerage account, swap TRADIER_API_KEY — no code changes.

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

  const quotes: unknown[] = Array.isArray(raw) ? raw : [raw];

  const map = new Map<string, MarketQuote>();
  for (const item of quotes) {
    const q = item as Record<string, unknown>;
    const sym = q.symbol as string | undefined;
    if (!sym) continue;

    // "last" is null when market is closed — fall back to close, then prevclose
    const price = (q.last ?? q.close ?? q.prevclose) as number | null;
    if (price == null) continue;

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
      marketState: q.last != null ? "REGULAR" : "CLOSED",
    });
  }
  return map;
}

// Yahoo Finance v8 — no auth, used as fallback when Tradier returns nothing
async function fetchYahooV8Quote(ticker: string): Promise<MarketQuote | null> {
  const sym = ticker.toUpperCase();
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 60 } }
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
    const map = await fetchTradierQuotes(tickers);

    // Fill any missing tickers from Yahoo Finance v8
    const missing = tickers.filter((t) => !map.has(t.toUpperCase()));
    if (missing.length > 0) {
      const fallbacks = await Promise.allSettled(missing.map(fetchYahooV8Quote));
      fallbacks.forEach((result, i) => {
        if (result.status === "fulfilled" && result.value) {
          map.set(missing[i].toUpperCase(), result.value);
        }
      });
    }

    return map;
  } catch {
    return new Map();
  }
}

export async function getQuote(ticker: string): Promise<MarketQuote | null> {
  const map = await getQuotes([ticker]);
  return map.get(ticker.toUpperCase()) ?? null;
}
