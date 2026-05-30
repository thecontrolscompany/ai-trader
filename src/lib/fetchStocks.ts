import type { StockRow } from "@/app/api/stocks/route";

export async function fetchTopStocks(): Promise<StockRow[]> {
  const res = await fetch(
    "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved" +
      "?formatted=false&lang=en-US&region=US&scrIds=most_actives&count=100&start=0",
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    }
  );

  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status}`);

  const json = await res.json();
  const quotes: Record<string, unknown>[] = json?.finance?.result?.[0]?.quotes ?? [];

  return quotes.map((q) => ({
    symbol: String(q.symbol ?? ""),
    name: String(q.shortName ?? q.longName ?? q.symbol ?? ""),
    price: Number(q.regularMarketPrice ?? 0),
    change: Number(q.regularMarketChange ?? 0),
    changePct: Number(q.regularMarketChangePercent ?? 0),
    volume: Number(q.regularMarketVolume ?? 0),
    avgVolume: Number(q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0),
    marketCap: q.marketCap != null ? Number(q.marketCap) : null,
    pe: q.trailingPE != null ? Number(q.trailingPE) : null,
    eps: q.epsTrailingTwelveMonths != null ? Number(q.epsTrailingTwelveMonths) : null,
    beta: q.beta != null ? Number(q.beta) : null,
    weekHigh52: q.fiftyTwoWeekHigh != null ? Number(q.fiftyTwoWeekHigh) : null,
    weekLow52: q.fiftyTwoWeekLow != null ? Number(q.fiftyTwoWeekLow) : null,
    dividendYield: q.trailingAnnualDividendYield != null
      ? Number(q.trailingAnnualDividendYield)
      : null,
  }));
}
