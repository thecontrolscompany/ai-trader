import type { StockRow } from "@/app/api/stocks/route";

// Fallback: broad list of well-known symbols used when screener fails
const FALLBACK_SYMBOLS = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","BRK-B","JPM","V",
  "UNH","XOM","LLY","WMT","MA","JNJ","PG","HD","MRK","AVGO",
  "CVX","ABBV","COST","PEP","KO","ADBE","CRM","TMO","ACN","MCD",
  "BAC","ABT","NFLX","CSCO","LIN","TXN","DHR","NEE","PM","RTX",
  "SPGI","AMGN","HON","UPS","INTU","IBM","CAT","GE","LOW","ISRG",
  "QCOM","AMD","NOW","AMAT","TJX","SYK","BKNG","VRTX","ELV","MMC",
  "DE","ADP","PLD","MDLZ","ADI","REGN","GILD","CI","ZTS","PANW",
  "SPY","QQQ","DIA","IWM","GLD","SLV","TLT","HYG",
];

async function fetchBySymbols(symbols: string[]): Promise<StockRow[]> {
  const joined = symbols.slice(0, 50).join(",");
  const res = await fetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${joined}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } }
  );
  if (!res.ok) throw new Error(`Yahoo Finance v7 returned ${res.status}`);
  const json = await res.json();
  const quotes: Record<string, unknown>[] = json?.quoteResponse?.result ?? [];
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
      ? Number(q.trailingAnnualDividendYield) : null,
  }));
}

export async function fetchTopStocks(): Promise<StockRow[]> {
  // Try screener first
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved" +
        "?formatted=false&lang=en-US&region=US&scrIds=most_actives&count=100&start=0",
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } }
    );
    if (res.ok) {
      const json = await res.json();
      const quotes: Record<string, unknown>[] = json?.finance?.result?.[0]?.quotes ?? [];
      if (quotes.length >= 20) {
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
            ? Number(q.trailingAnnualDividendYield) : null,
        }));
      }
    }
  } catch { /* fall through to backup */ }

  // Fallback: fetch known symbols directly via v7 quote API
  const [batch1, batch2] = await Promise.all([
    fetchBySymbols(FALLBACK_SYMBOLS.slice(0, 50)),
    fetchBySymbols(FALLBACK_SYMBOLS.slice(50)),
  ]);
  return [...batch1, ...batch2];
}
