import { db } from "@/db";
import { aiSignals } from "@/db/schema";
import { newId } from "@/lib/id";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import type { StockRow } from "@/app/api/stocks/route";

export type ScanModel = "claude" | "openai";

export type RiskLevel = "conservative" | "moderate" | "aggressive";

export interface ScanPick {
  symbol: string;
  name: string;
  direction: "long" | "short" | "neutral";
  confidence: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  targetPrice: number;
  stopLoss: number;
  timeHorizon: string;
  reasoning: string;
  keyMetrics: string[];
  signalId: string;
  riskLevel: RiskLevel;
  riskRewardRatio: string;   // e.g. "1:2.5"
  maxLossDollar: number;     // dollars at risk per share
  maxGainDollar: number;     // potential gain per share
}

export interface ScanResult {
  model: string;
  summary: string;
  picks: ScanPick[];
  scannedAt: string;
}

const SYSTEM_PROMPT = `You are a stock market analyst who explains things in plain, simple English for beginners.
Your job is to find undervalued stocks with real potential.
You never use Wall Street jargon without explaining it.
You respond ONLY with valid JSON — no markdown, no code blocks, no extra text.`;

function buildUserPrompt(stocks: StockRow[], modelLabel: string): string {
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
    hi52: s.weekHigh52,
    lo52: s.weekLow52,
    divYld: s.dividendYield ? +(s.dividendYield * 100).toFixed(2) + "%" : null,
  }));

  return `You are scanning ${stocks.length} stocks to find the best 6-8 opportunities for a BEGINNER investor.

Criteria for a good beginner pick:
- P/E under 25 (company isn't overpriced relative to earnings)
- Positive EPS (company is actually profitable)
- Beta under 1.5 (not wildly volatile)
- Price at least 10% below 52-week high (some room to grow)
- Market cap over $5B (established, safer companies)
- Strong volume (easy to buy and sell)

Bonus points: dividend yield, strong market cap, price near 52-week low.

Stock data (mktCap in billions):
${JSON.stringify(compact)}

Return ONLY this exact JSON (no markdown, no explanation outside JSON):
{
  "model": "${modelLabel}",
  "summary": "2-3 sentences in plain English: what patterns you saw in the market today and what your scan found",
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
      "reasoning": "In plain English: why this stock looks like a good deal right now. Explain each reason like the reader has never invested before.",
      "keyMetrics": [
        "P/E of 18 — this means you pay $18 for every $1 the company earns. That's a fair price.",
        "Price is 22% below its yearly high — there's room to grow back up.",
        "Company earned $4.20 per share last year — it's profitable."
      ]
    }
  ]
}

riskLevel rules:
- "conservative": stop loss within 3%, reward/risk >= 2:1, low beta (< 0.9), large-cap
- "moderate": stop loss 3-7%, reward/risk >= 1.5:1, beta 0.9-1.4
- "aggressive": stop loss > 7%, reward/risk < 1.5:1, or high beta (> 1.4), or small-cap
riskRewardRatio: format as "1:X" where X = (targetPrice - entry) / (entry - stopLoss), rounded to 1 decimal
maxLossDollar: entry midpoint minus stopLoss (per share)
maxGainDollar: targetPrice minus entry midpoint (per share)`;
}

async function callClaude(stocks: StockRow[]): Promise<ScanResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildUserPrompt(stocks, "Claude Sonnet 4.6") }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return JSON.parse(text) as ScanResult;
}

async function callOpenAI(stocks: StockRow[]): Promise<ScanResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(stocks, "GPT-4o") },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as ScanResult;
}

export async function POST(req: NextRequest) {
  const { model }: { model: ScanModel } = await req.json();

  if (!["claude", "openai"].includes(model)) {
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  }
  if (model === "claude" && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }
  if (model === "openai" && !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  // Fetch live stock data directly (no internal HTTP call — avoids timeout issues)
  const { fetchTopStocks } = await import("@/lib/fetchStocks");
  const stocks: StockRow[] = await fetchTopStocks();

  // Call AI
  const raw = model === "claude"
    ? await callClaude(stocks)
    : await callOpenAI(stocks);

  // Save each pick to ai_signals table
  const stockMap = Object.fromEntries(stocks.map((s) => [s.symbol, s]));
  const picks: ScanPick[] = [];

  for (const pick of raw.picks ?? []) {
    const id = newId();
    try {
      await db.insert(aiSignals).values({
        id,
        ticker: pick.symbol,
        model: raw.model ?? model,
        direction: pick.direction ?? "long",
        entryZoneLow: Number(pick.entryZoneLow),
        entryZoneHigh: Number(pick.entryZoneHigh),
        targetPrice: Number(pick.targetPrice),
        stopLoss: Number(pick.stopLoss),
        timeHorizon: pick.timeHorizon ?? "unknown",
        confidence: Number(pick.confidence ?? 0.5),
        reasoning: pick.reasoning ?? "",
      });
    } catch {
      // continue if one insert fails
    }

    const entry = (Number(pick.entryZoneLow) + Number(pick.entryZoneHigh)) / 2;
    const maxLoss = entry - Number(pick.stopLoss);
    const maxGain = Number(pick.targetPrice) - entry;
    const rrRaw = maxLoss > 0 ? maxGain / maxLoss : 0;
    const riskRewardRatio = pick.riskRewardRatio ?? `1:${rrRaw.toFixed(1)}`;
    const maxLossDollar = pick.maxLossDollar ?? maxLoss;
    const maxGainDollar = pick.maxGainDollar ?? maxGain;
    const riskLevel: RiskLevel = pick.riskLevel ?? (
      maxLoss / entry < 0.03 && rrRaw >= 2 ? "conservative"
      : maxLoss / entry > 0.07 ? "aggressive"
      : "moderate"
    );

    picks.push({
      ...pick,
      name: stockMap[pick.symbol]?.name ?? pick.symbol,
      signalId: id,
      riskLevel,
      riskRewardRatio,
      maxLossDollar: Number(maxLossDollar.toFixed(2)),
      maxGainDollar: Number(maxGainDollar.toFixed(2)),
    });
  }

  const result: ScanResult = {
    model: raw.model ?? model,
    summary: raw.summary ?? "",
    picks,
    scannedAt: new Date().toISOString(),
  };

  return NextResponse.json(result);
}
