/**
 * Shared AI scan helpers — used by both /api/scan (manual) and autoTradeEngine (automated).
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { StockRow } from "@/app/api/stocks/route";
import { enrichStockUniverse, type EnrichedStockRow } from "@/lib/stockAnalysis";
import { getHistoricalScanContext } from "@/lib/scanHistory";
import { estimateScanSpend } from "@/lib/roiTracker";

export interface RawScanResult {
  model: string;
  summary: string;
  picks: Record<string, unknown>[];
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedCostUsd?: number;
}

function hasTrendFields(stock: StockRow | EnrichedStockRow): stock is EnrichedStockRow {
  return "setupQualityScore" in stock && "trendSummary" in stock;
}

const SYSTEM_PROMPT = `You are a stock market analyst who explains things in plain, simple English for beginners.
Your job is to find undervalued stocks with real potential.
You never use Wall Street jargon without explaining it.
You respond ONLY with valid JSON — no markdown, no code blocks, no extra text.`;

export function buildUserPrompt(
  stocks: EnrichedStockRow[],
  modelLabel: string,
  historicalContext?: Awaited<ReturnType<typeof getHistoricalScanContext>>
): string {
  const compact = stocks.map((s) => ({
    sym: s.symbol,
    name: s.name,
    price: s.price,
    chgPct: +s.changePct.toFixed(2),
    pe: s.pe,
    eps: s.eps,
    beta: s.beta,
    mktCap: s.marketCap ? +(s.marketCap / 1e9).toFixed(2) + "B" : null,
    vol: s.volume,
    avgVol: s.avgVolume,
    hi52: s.weekHigh52,
    lo52: s.weekLow52,
    divYld: s.dividendYield ? +(s.dividendYield * 100).toFixed(2) + "%" : null,
    trend: {
      qualityScore: s.setupQualityScore,
      direction: s.trendDirection,
      summary: s.trendSummary,
      return5d: s.return5d != null ? +s.return5d.toFixed(2) : null,
      return20d: s.return20d != null ? +s.return20d.toFixed(2) : null,
      return60d: s.return60d != null ? +s.return60d.toFixed(2) : null,
      sma20Gap: s.priceToSma20Pct != null ? +s.priceToSma20Pct.toFixed(2) : null,
      sma50Gap: s.priceToSma50Pct != null ? +s.priceToSma50Pct.toFixed(2) : null,
      sma200Gap: s.priceToSma200Pct != null ? +s.priceToSma200Pct.toFixed(2) : null,
      rsi14: s.rsi14 != null ? +s.rsi14.toFixed(1) : null,
      volRatio20: s.volumeRatio20 != null ? +s.volumeRatio20.toFixed(2) : null,
      vol20: s.volatility20 != null ? +s.volatility20.toFixed(4) : null,
      fromHigh52w: s.distanceFrom52wHighPct != null ? +s.distanceFrom52wHighPct.toFixed(2) : null,
      fromLow52w: s.distanceFrom52wLowPct != null ? +s.distanceFrom52wLowPct.toFixed(2) : null,
    },
  }));

  const history = historicalContext
    ? [
        "Historical performance from our own paper trades:",
        historicalContext.summary,
        ...historicalContext.highlights.map((line) => `- ${line}`),
      ].join("\n")
    : "Historical performance from our own paper trades:\n- No historical context available.";

  return `You are scanning ${stocks.length} stocks to find 6-10 opportunities — prioritizing DIAMONDS IN THE ROUGH over well-known names.

Your goal: find overlooked, undervalued, or under-the-radar stocks with real potential.
Avoid defaulting to Apple, Microsoft, Amazon, Google, Tesla, Nvidia — only include mega-caps if genuinely compelling.
Favor lesser-known companies that most people haven't heard of but show strong fundamentals.

Be more thorough than a basic screen:
- Look for price trend, momentum, and downside risk, not just valuation.
- Check whether the stock is near a meaningful support area or a 52-week extreme.
- Prefer clear evidence over vague enthusiasm. If the setup is weak, mark it as weak.
- When a stock looks interesting, explain why it survived a deeper second look.
- Treat setupQualityScore as a gating signal. Scores under 50 should only make the list if the thesis is unusually strong.
- Favor setups where trend and fundamentals agree. If they conflict, explain the conflict instead of forcing a bullish call.

What makes a diamond in the rough:
- Smaller or mid-size company ($500M–$20B market cap preferred)
- Beaten down price (near 52-week low) but healthy earnings or growth
- Low P/E relative to peers or sector
- Strong EPS the market hasn't priced in yet
- High short interest = squeeze potential
- Low analyst coverage = market inefficiency = opportunity

Also include 1-2 SHORT candidates if any stocks look dangerously overvalued.

${history}

Stock data (mktCap in billions):
${JSON.stringify(compact)}

Mix of risk levels: at least 1 conservative, 2-3 moderate, 1-2 aggressive.

Return ONLY this exact JSON (no markdown):
{
  "model": "${modelLabel}",
  "summary": "2-3 plain-English sentences about what you found",
  "picks": [
    {
      "symbol": "TICKER",
      "direction": "long",
      "confidence": 0.75,
      "entryZoneLow": 150.00,
      "entryZoneHigh": 157.00,
      "targetPrice": 180.00,
      "stopLoss": 143.00,
      "timeHorizon": "2-3 months",
      "riskLevel": "moderate",
      "riskRewardRatio": "1:2.1",
      "maxLossDollar": 7.00,
      "maxGainDollar": 23.00,
      "reasoning": "Plain English explanation for a beginner.",
      "keyMetrics": ["metric 1", "metric 2", "metric 3"]
    }
  ]
}

riskLevel rules:
- "conservative": stop loss <3%, reward/risk >=2:1, low beta (<0.9), large-cap
- "moderate": stop loss 3-7%, reward/risk >=1.5:1, beta 0.9-1.4
- "aggressive": stop loss >7%, or high beta (>1.4), or small-cap`;
}

export async function callClaude(stocks: StockRow[], customSystemPrompt?: string): Promise<RawScanResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const historicalContext = await getHistoricalScanContext();
  const universe = stocks.length > 0 && hasTrendFields(stocks[0])
    ? stocks as EnrichedStockRow[]
    : await enrichStockUniverse(stocks, 40);
  const prompt = buildUserPrompt(universe, "Claude Sonnet 4.6", historicalContext);
  const systemText = customSystemPrompt ?? SYSTEM_PROMPT;
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
  const spend = estimateScanSpend("claude", prompt, text);
  return {
    ...JSON.parse(text),
    estimatedInputTokens: spend.inputTokens,
    estimatedOutputTokens: spend.outputTokens,
    estimatedCostUsd: spend.estimatedCostUsd,
  };
}

export async function callOpenAI(stocks: StockRow[], customSystemPrompt?: string): Promise<RawScanResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const historicalContext = await getHistoricalScanContext();
  const universe = stocks.length > 0 && hasTrendFields(stocks[0])
    ? stocks as EnrichedStockRow[]
    : await enrichStockUniverse(stocks, 40);
  const prompt = buildUserPrompt(universe, "GPT-4o", historicalContext);
  const systemText = customSystemPrompt ?? SYSTEM_PROMPT;
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: prompt },
    ],
  });
  const text = response.choices[0]?.message?.content ?? "{}";
  const spend = estimateScanSpend("openai", prompt, text);
  return {
    ...JSON.parse(text),
    estimatedInputTokens: spend.inputTokens,
    estimatedOutputTokens: spend.outputTokens,
    estimatedCostUsd: spend.estimatedCostUsd,
  };
}
