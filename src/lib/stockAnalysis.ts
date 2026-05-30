import type { StockRow } from "@/app/api/stocks/route";

export interface HistoricalTrendFeatures {
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  priceToSma20Pct: number | null;
  priceToSma50Pct: number | null;
  priceToSma200Pct: number | null;
  rsi14: number | null;
  volumeRatio20: number | null;
  volatility20: number | null;
  distanceFrom52wHighPct: number | null;
  distanceFrom52wLowPct: number | null;
  trendDirection: "bullish" | "bearish" | "mixed";
  setupQualityScore: number;
  trendSummary: string;
}

export type EnrichedStockRow = StockRow & HistoricalTrendFeatures;

type HistoricalPoint = {
  date: string;
  close: number;
  high: number;
  low: number;
  volume: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function avg(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

function stddev(values: number[]): number | null {
  const mean = avg(values);
  if (mean == null) return null;
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  const variance = clean.reduce((sum, v) => sum + (v - mean) ** 2, 0) / clean.length;
  return Math.sqrt(variance);
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function calcRsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gains = 0;
  let losses = 0;
  const deltas = closes.slice(1).map((close, i) => close - closes[i]);
  const seed = deltas.slice(0, 14);
  for (const delta of seed) {
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / 14;
  let avgLoss = losses / 14;
  for (const delta of deltas.slice(14)) {
    avgGain = ((avgGain * 13) + Math.max(delta, 0)) / 14;
    avgLoss = ((avgLoss * 13) + Math.max(-delta, 0)) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  const results: U[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function snapshotScore(stock: StockRow): number {
  let score = 0;

  if (stock.marketCap != null) {
    const cap = stock.marketCap;
    if (cap >= 5e8 && cap <= 2e10) score += 18;
    else if (cap < 5e8) score += 10;
    else score += 6;
  }

  if (stock.pe != null && stock.pe > 0) {
    if (stock.pe >= 8 && stock.pe <= 30) score += 10;
    else if (stock.pe < 8) score += 4;
  }

  if (stock.beta != null) {
    if (stock.beta >= 0.8 && stock.beta <= 1.7) score += 6;
    else score += 2;
  }

  if (stock.changePct > 0) score += Math.min(8, stock.changePct / 2);
  if (stock.volume > stock.avgVolume * 1.25) score += 6;

  const nearLow = stock.weekLow52 != null ? (stock.price - stock.weekLow52) / stock.weekLow52 : null;
  if (nearLow != null && nearLow >= 0 && nearLow <= 0.35) score += 6;

  return score;
}

async function fetchHistoricalSeries(symbol: string): Promise<HistoricalPoint[]> {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&includePrePost=false&events=div,splits`,
    { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } }
  );

  if (!response.ok) return [];

  const json = await response.json();
  const result = json?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const closes: number[] = result?.indicators?.adjclose?.[0]?.adjclose ?? quote.close ?? [];
  const highs: number[] = quote.high ?? [];
  const lows: number[] = quote.low ?? [];
  const volumes: number[] = quote.volume ?? [];

  return timestamps.map((ts, index) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    close: Number(closes[index] ?? 0),
    high: Number(highs[index] ?? closes[index] ?? 0),
    low: Number(lows[index] ?? closes[index] ?? 0),
    volume: Number(volumes[index] ?? 0),
  })).filter((row) => row.close > 0);
}

function computeTrendFeatures(stock: StockRow, history: HistoricalPoint[]): HistoricalTrendFeatures {
  if (history.length < 30) {
    return {
      return5d: null,
      return20d: null,
      return60d: null,
      sma20: null,
      sma50: null,
      sma200: null,
      priceToSma20Pct: null,
      priceToSma50Pct: null,
      priceToSma200Pct: null,
      rsi14: null,
      volumeRatio20: null,
      volatility20: null,
      distanceFrom52wHighPct: null,
      distanceFrom52wLowPct: null,
      trendDirection: "mixed",
      setupQualityScore: Math.round(snapshotScore(stock)),
      trendSummary: "Not enough historical data to compute trend features.",
    };
  }

  const closes = history.map((row) => row.close);
  const highs = history.map((row) => row.high);
  const lows = history.map((row) => row.low);
  const volumes = history.map((row) => row.volume);
  const last = history[history.length - 1];
  const close = last.close;

  const sma20 = avg(closes.slice(-20));
  const sma50 = avg(closes.slice(-50));
  const sma200 = avg(closes.slice(-200));

  const return5d = pctChange(close, closes.at(-6) ?? null);
  const return20d = pctChange(close, closes.at(-21) ?? null);
  const return60d = pctChange(close, closes.at(-61) ?? null);
  const priceToSma20Pct = sma20 != null ? ((close / sma20) - 1) * 100 : null;
  const priceToSma50Pct = sma50 != null ? ((close / sma50) - 1) * 100 : null;
  const priceToSma200Pct = sma200 != null ? ((close / sma200) - 1) * 100 : null;
  const rsi14 = calcRsi14(closes);
  const avgVol20 = avg(volumes.slice(-20));
  const volumeRatio20 = avgVol20 != null && avgVol20 > 0 ? last.volume / avgVol20 : null;
  const dailyReturns = closes.slice(1).map((value, index) => (value - closes[index]) / closes[index]);
  const volatility20 = stddev(dailyReturns.slice(-20));
  const high52 = Math.max(...highs.slice(-252));
  const low52 = Math.min(...lows.slice(-252));
  const distanceFrom52wHighPct = high52 > 0 ? ((high52 - close) / high52) * 100 : null;
  const distanceFrom52wLowPct = low52 > 0 ? ((close - low52) / low52) * 100 : null;

  const bullishSignals = [
    (return20d ?? 0) > 0,
    (return60d ?? 0) > 0,
    (priceToSma50Pct ?? -999) > 0,
    (priceToSma200Pct ?? -999) > 0,
    (volumeRatio20 ?? 0) > 1.15,
  ].filter(Boolean).length;

  const bearishSignals = [
    (return20d ?? 0) < 0,
    (return60d ?? 0) < 0,
    (priceToSma50Pct ?? 999) < 0,
    (priceToSma200Pct ?? 999) < 0,
    (rsi14 ?? 50) > 70,
  ].filter(Boolean).length;

  let longScore = 50;
  let shortScore = 50;

  if (return20d != null) {
    longScore += clamp(return20d / 2, -10, 15);
    shortScore += clamp(-return20d / 2, -10, 15);
  }
  if (return60d != null) {
    longScore += clamp(return60d / 4, -8, 10);
    shortScore += clamp(-return60d / 4, -8, 10);
  }
  if (priceToSma50Pct != null) {
    longScore += clamp(priceToSma50Pct / 2, -12, 10);
    shortScore += clamp(-priceToSma50Pct / 2, -12, 10);
  }
  if (priceToSma200Pct != null) {
    longScore += clamp(priceToSma200Pct / 2, -14, 12);
    shortScore += clamp(-priceToSma200Pct / 2, -14, 12);
  }
  if (volumeRatio20 != null) {
    const volumeBonus = clamp((volumeRatio20 - 1) * 12, -6, 10);
    longScore += volumeBonus;
    shortScore += volumeBonus / 2;
  }
  if (rsi14 != null) {
    if (rsi14 >= 45 && rsi14 <= 70) longScore += 6;
    if (rsi14 <= 35) longScore += 4;
    if (rsi14 >= 75) shortScore += 8;
    if (rsi14 >= 60 && rsi14 <= 75) shortScore += 4;
  }
  if (distanceFrom52wLowPct != null && distanceFrom52wLowPct >= 0 && distanceFrom52wLowPct <= 35) {
    longScore += 7;
  }
  if (distanceFrom52wHighPct != null && distanceFrom52wHighPct <= 15) {
    shortScore += 8;
  }
  if (stock.marketCap != null) {
    if (stock.marketCap >= 5e8 && stock.marketCap <= 2e10) {
      longScore += 4;
      shortScore += 4;
    }
  }
  if (stock.pe != null && stock.pe > 0 && stock.pe <= 35) {
    longScore += 4;
  }
  if (stock.beta != null) {
    if (stock.beta > 1.4) {
      shortScore += 3;
    } else if (stock.beta >= 0.8 && stock.beta <= 1.4) {
      longScore += 3;
    }
  }
  if (volatility20 != null) {
    if (volatility20 > 0.05) {
      longScore -= 4;
      shortScore -= 2;
    }
  }

  longScore += bullishSignals * 2;
  shortScore += bearishSignals * 2;

  const direction = longScore >= shortScore + 8
    ? "bullish"
    : shortScore >= longScore + 8
      ? "bearish"
      : "mixed";

  const setupQualityScore = Math.round(clamp(Math.max(longScore, shortScore), 0, 100));

  const trendSummaryParts = [
    direction === "bullish"
      ? "Trend leans bullish."
      : direction === "bearish"
        ? "Trend leans bearish."
        : "Trend is mixed.",
    return20d != null ? `20-day return ${return20d >= 0 ? "+" : ""}${return20d.toFixed(1)}%.` : "",
    priceToSma50Pct != null ? `Price is ${priceToSma50Pct >= 0 ? "+" : ""}${priceToSma50Pct.toFixed(1)}% vs 50-day SMA.` : "",
    rsi14 != null ? `RSI ${rsi14.toFixed(1)}.` : "",
    volumeRatio20 != null ? `Volume ratio ${volumeRatio20.toFixed(2)}x.` : "",
  ].filter(Boolean);

  return {
    return5d,
    return20d,
    return60d,
    sma20,
    sma50,
    sma200,
    priceToSma20Pct,
    priceToSma50Pct,
    priceToSma200Pct,
    rsi14,
    volumeRatio20,
    volatility20,
    distanceFrom52wHighPct,
    distanceFrom52wLowPct,
    trendDirection: direction,
    setupQualityScore,
    trendSummary: trendSummaryParts.join(" "),
  };
}

export async function enrichStockUniverse(stocks: StockRow[], limit = 40): Promise<EnrichedStockRow[]> {
  const ranked = [...stocks]
    .filter((stock) => stock.symbol && stock.price > 0)
    .sort((a, b) => snapshotScore(b) - snapshotScore(a))
    .slice(0, limit);

  const enriched = await mapWithConcurrency(ranked, 6, async (stock) => {
    try {
      const history = await fetchHistoricalSeries(stock.symbol);
      const features = computeTrendFeatures(stock, history);
      return { ...stock, ...features };
    } catch {
      return {
        ...stock,
        return5d: null,
        return20d: null,
        return60d: null,
        sma20: null,
        sma50: null,
        sma200: null,
        priceToSma20Pct: null,
        priceToSma50Pct: null,
        priceToSma200Pct: null,
        rsi14: null,
        volumeRatio20: null,
        volatility20: null,
        distanceFrom52wHighPct: null,
        distanceFrom52wLowPct: null,
        trendDirection: "mixed" as const,
        setupQualityScore: Math.round(snapshotScore(stock)),
        trendSummary: "Historical feature fetch failed; using snapshot-only scoring.",
      };
    }
  });

  return enriched.sort((a, b) => b.setupQualityScore - a.setupQualityScore);
}
