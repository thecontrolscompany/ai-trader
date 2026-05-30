import TickerScroll, { type TickerItem } from "./TickerScroll";

const SYMBOLS = [
  "SPY", "QQQ", "DIA", "IWM",
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK-B",
  "JPM", "V", "UNH", "XOM", "LLY", "WMT", "MA",
];

async function fetchQuotes(symbols: string[]): Promise<TickerItem[]> {
  try {
    const joined = symbols.join(",");
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${joined}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 60 },
      }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const quotes: Record<string, unknown>[] = json?.quoteResponse?.result ?? [];
    return quotes.map((q) => ({
      symbol: String(q.symbol ?? ""),
      price: Number(q.regularMarketPrice ?? 0),
      change: Number(q.regularMarketChange ?? 0),
      changePct: Number(q.regularMarketChangePercent ?? 0),
    }));
  } catch {
    return [];
  }
}

export default async function TickerBar() {
  const items = await fetchQuotes(SYMBOLS);
  return <TickerScroll items={items} />;
}
