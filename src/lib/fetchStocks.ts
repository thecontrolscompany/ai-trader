import type { StockRow } from "@/app/api/stocks/route";

function mapQuote(q: Record<string, unknown>): StockRow {
  return {
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
  };
}

async function fetchScreener(scrId: string, count = 50): Promise<StockRow[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved` +
        `?formatted=false&lang=en-US&region=US&scrIds=${scrId}&count=${count}&start=0`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const quotes: Record<string, unknown>[] = json?.finance?.result?.[0]?.quotes ?? [];
    return quotes.map(mapQuote);
  } catch { return []; }
}

async function fetchBySymbols(symbols: string[]): Promise<StockRow[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.quoteResponse?.result ?? []).map(mapQuote);
  } catch { return []; }
}

// Mid/small cap "diamond in the rough" candidates across sectors
const HIDDEN_GEM_SYMBOLS = [
  // Mid-cap value/growth
  "CELH","ASTS","IONQ","ARRY","SPCE","RKLB","LILM","JOBY","ACHR",
  "MARA","RIOT","HUT","BITF","CLSK",
  // Healthcare overlooked
  "RXRX","ROIV","TMDX","ATMU","INSP","NVCR","FATE","NTLA",
  // Industrials/clean energy
  "PLUG","FCEL","BE","ENVX","ASTS","STEM","SHLS","ARRY",
  // Consumer/retail underdogs
  "BIRD","WOLF","PRCT","AFRM","UPST","OPEN","DKNG","PENN",
  // Tech undervalued
  "AI","BBAI","SOUN","GFAI","CPNG","GRAB","SEA","MELI","NU",
  // Finance mid-caps
  "SOFI","LC","UWMC","RKT","PFSI","COOP",
  // Energy
  "TPVG","SM","CIVI","MTDR","SBOW","CHRD",
  // International ADRs often overlooked
  "BABA","JD","PDD","NIO","LI","XPEV","BEKE","TAL",
];

export async function fetchTopStocks(): Promise<StockRow[]> {
  // Fetch from 4 different screeners + hidden gems in parallel
  const [actives, undervalued, smallCap, gainers, gems] = await Promise.all([
    fetchScreener("most_actives", 50),
    fetchScreener("undervalued_growth_stocks", 30),
    fetchScreener("small_cap_gainers", 30),
    fetchScreener("day_gainers", 30),
    fetchBySymbols(HIDDEN_GEM_SYMBOLS),
  ]);

  // Merge, deduplicate by symbol, keep first occurrence
  const seen = new Set<string>();
  const all: StockRow[] = [];
  for (const row of [...actives, ...undervalued, ...smallCap, ...gainers, ...gems]) {
    if (row.symbol && !seen.has(row.symbol) && row.price > 0) {
      seen.add(row.symbol);
      all.push(row);
    }
  }

  return all;
}
