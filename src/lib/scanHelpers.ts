/**
 * Shared AI scan helpers — used by both /api/scan (manual) and autoTradeEngine (automated).
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { StockRow } from "@/app/api/stocks/route";

export interface RawScanResult {
  model: string;
  summary: string;
  picks: Record<string, unknown>[];
}

const SYSTEM_PROMPT = `You are a stock market analyst who explains things in plain, simple English for beginners.
Your job is to find undervalued stocks with real potential.
You never use Wall Street jargon without explaining it.
You respond ONLY with valid JSON — no markdown, no code blocks, no extra text.`;

export function buildUserPrompt(stocks: StockRow[], modelLabel: string): string {
  const compact = stocks.map((s) => ({
    sym: s.symbol, name: s.name, price: s.price,
    chgPct: +s.changePct.toFixed(2), pe: s.pe, eps: s.eps, beta: s.beta,
    mktCap: s.marketCap ? +(s.marketCap / 1e9).toFixed(2) + "B" : null,
    vol: s.volume, hi52: s.weekHigh52, lo52: s.weekLow52,
    divYld: s.dividendYield ? +(s.dividendYield * 100).toFixed(2) + "%" : null,
  }));

  return `You are scanning ${stocks.length} stocks to find 6-10 opportunities — prioritizing DIAMONDS IN THE ROUGH over well-known names.

Your goal: find overlooked, undervalued, or under-the-radar stocks with real potential.
Avoid defaulting to Apple, Microsoft, Amazon, Google, Tesla, Nvidia — only include mega-caps if genuinely compelling.
Favor lesser-known companies that most people haven't heard of but show strong fundamentals.

What makes a diamond in the rough:
- Smaller or mid-size company ($500M–$20B market cap preferred)
- Beaten down price (near 52-week low) but healthy earnings or growth
- Low P/E relative to peers or sector
- Strong EPS the market hasn't priced in yet
- High short interest = squeeze potential
- Low analyst coverage = market inefficiency = opportunity

Also include 1-2 SHORT candidates if any stocks look dangerously overvalued.

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

export async function callClaude(stocks: StockRow[]): Promise<RawScanResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserPrompt(stocks, "Claude Sonnet 4.6") }],
  });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
  return JSON.parse(text);
}

export async function callOpenAI(stocks: StockRow[]): Promise<RawScanResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(stocks, "GPT-4o") },
    ],
  });
  return JSON.parse(response.choices[0]?.message?.content ?? "{}");
}
