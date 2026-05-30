import { db } from "@/db";
import { aiSignals } from "@/db/schema";
import { newId } from "@/lib/id";
import { fetchTopStocks } from "@/lib/fetchStocks";
import { callClaude, callOpenAI } from "@/lib/scanHelpers";
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
  riskRewardRatio: string;
  maxLossDollar: number;
  maxGainDollar: number;
}

export interface ScanResult {
  model: string;
  summary: string;
  picks: ScanPick[];
  scannedAt: string;
}

export async function POST(req: NextRequest) {
  const { model }: { model: ScanModel } = await req.json();

  if (!["claude", "openai"].includes(model))
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  if (model === "claude" && !process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  if (model === "openai" && !process.env.OPENAI_API_KEY)
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const stocks: StockRow[] = await fetchTopStocks();
  const raw = model === "claude" ? await callClaude(stocks) : await callOpenAI(stocks);

  const stockMap = Object.fromEntries(stocks.map((s) => [s.symbol, s]));
  const picks: ScanPick[] = [];

  for (const pick of (raw.picks as Record<string, unknown>[]) ?? []) {
    const id = newId();
    try {
      await db.insert(aiSignals).values({
        id, ticker: String(pick.symbol), model: raw.model ?? model,
        direction: (pick.direction as "long" | "short" | "neutral") ?? "long",
        entryZoneLow: Number(pick.entryZoneLow), entryZoneHigh: Number(pick.entryZoneHigh),
        targetPrice: Number(pick.targetPrice), stopLoss: Number(pick.stopLoss),
        timeHorizon: String(pick.timeHorizon ?? "unknown"),
        confidence: Number(pick.confidence ?? 0.5),
        reasoning: String(pick.reasoning ?? ""),
      });
    } catch { /* continue */ }

    const entry = (Number(pick.entryZoneLow) + Number(pick.entryZoneHigh)) / 2;
    const maxLoss = entry - Number(pick.stopLoss);
    const maxGain = Number(pick.targetPrice) - entry;
    const rrRaw = maxLoss > 0 ? maxGain / maxLoss : 0;
    const riskLevel: RiskLevel = (pick.riskLevel as RiskLevel) ?? (
      maxLoss / entry < 0.03 && rrRaw >= 2 ? "conservative" : maxLoss / entry > 0.07 ? "aggressive" : "moderate"
    );

    picks.push({
      ...(pick as Omit<ScanPick, "name" | "signalId">),
      name: stockMap[String(pick.symbol)]?.name ?? String(pick.symbol),
      signalId: id,
      riskLevel,
      riskRewardRatio: String(pick.riskRewardRatio ?? `1:${rrRaw.toFixed(1)}`),
      maxLossDollar: Number(Number(pick.maxLossDollar ?? maxLoss).toFixed(2)),
      maxGainDollar: Number(Number(pick.maxGainDollar ?? maxGain).toFixed(2)),
    });
  }

  return NextResponse.json({
    model: raw.model ?? model,
    summary: raw.summary ?? "",
    picks,
    scannedAt: new Date().toISOString(),
  } as ScanResult);
}
