import { fetchTopStocks } from "@/lib/fetchStocks";
import { saveScanSignals } from "@/lib/roiTracker";
import { callClaude, callOpenAI } from "@/lib/scanHelpers";
import { enrichStockUniverse, type EnrichedStockRow } from "@/lib/stockAnalysis";
import { NextRequest, NextResponse } from "next/server";
import type { StockRow } from "@/app/api/stocks/route";

export type ScanModel = "claude" | "openai" | "compare";
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
  riskLevel: RiskLevel;
  riskRewardRatio: string;
  maxLossDollar: number;
  maxGainDollar: number;
  setupQualityScore?: number | null;
  trendDirection?: "bullish" | "bearish" | "mixed" | null;
  trendSummary?: string;
  signalId?: string | null;
  sourceModels?: string[];
  agreementScore?: number;
}

export interface ScanResult {
  model: string;
  summary: string;
  picks: ScanPick[];
  scannedAt: string;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedCostUsd?: number;
  comparison?: {
    openai: ModelRunResult;
    claude: ModelRunResult;
    overlapCount: number;
    openaiOnly: string[];
    claudeOnly: string[];
    consensusSummary: string;
  };
}

interface ModelRunResult {
  model: string;
  summary: string;
  picks: ScanPick[];
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedCostUsd?: number;
}

type RawModelPick = Record<string, unknown> & {
  symbol?: string;
  name?: string;
  direction?: "long" | "short" | "neutral";
  confidence?: number;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  targetPrice?: number;
  stopLoss?: number;
  timeHorizon?: string;
  reasoning?: string;
  keyMetrics?: string[];
  riskLevel?: RiskLevel;
  riskRewardRatio?: string;
  maxLossDollar?: number;
  maxGainDollar?: number;
};

function getRiskRank(risk?: RiskLevel) {
  return risk === "conservative" ? 0 : risk === "moderate" ? 1 : 2;
}

function mergeMetrics(...lists: Array<string[] | undefined>) {
  return [...new Set(lists.flatMap((items) => items ?? []))].slice(0, 5);
}

function normalizePick(
  pick: RawModelPick,
  stockMap: Record<string, EnrichedStockRow>
): Omit<ScanPick, "signalId" | "sourceModels" | "agreementScore"> | null {
  const symbol = String(pick.symbol ?? "").toUpperCase();
  const entryLow = Number(pick.entryZoneLow ?? 0);
  const entryHigh = Number(pick.entryZoneHigh ?? pick.entryZoneLow ?? 0);
  const target = Number(pick.targetPrice ?? 0);
  const stop = Number(pick.stopLoss ?? 0);
  if (!symbol || entryLow <= 0 || entryHigh <= 0 || target <= 0 || stop <= 0) return null;

  const entry = (entryLow + entryHigh) / 2;
  const maxLoss = entry - stop;
  const maxGain = target - entry;
  const rrRaw = maxLoss > 0 ? maxGain / maxLoss : 0;
  const stock = stockMap[symbol];
  const riskLevel: RiskLevel = pick.riskLevel ?? (
    maxLoss / entry < 0.03 && rrRaw >= 2 ? "conservative" : maxLoss / entry > 0.07 ? "aggressive" : "moderate"
  );

  return {
    symbol,
    name: stock?.name ?? symbol,
    direction: (pick.direction as "long" | "short" | "neutral") ?? "long",
    confidence: Number(pick.confidence ?? 0.5),
    entryZoneLow: entryLow,
    entryZoneHigh: entryHigh,
    targetPrice: target,
    stopLoss: stop,
    timeHorizon: String(pick.timeHorizon ?? "unknown"),
    reasoning: String(pick.reasoning ?? ""),
    keyMetrics: Array.isArray(pick.keyMetrics) ? pick.keyMetrics.map(String) : [],
    riskLevel,
    riskRewardRatio: String(pick.riskRewardRatio ?? `1:${rrRaw.toFixed(1)}`),
    maxLossDollar: Number(Number(pick.maxLossDollar ?? maxLoss).toFixed(2)),
    maxGainDollar: Number(Number(pick.maxGainDollar ?? maxGain).toFixed(2)),
    setupQualityScore: stock?.setupQualityScore ?? null,
    trendDirection: stock?.trendDirection ?? null,
    trendSummary: stock?.trendSummary ?? "",
  };
}

function mergeModelRuns(openai: ModelRunResult, claude: ModelRunResult): ScanPick[] {
  const openaiMap = new Map(openai.picks.map((pick) => [pick.symbol, pick]));
  const claudeMap = new Map(claude.picks.map((pick) => [pick.symbol, pick]));
  const allSymbols = [...new Set([...openaiMap.keys(), ...claudeMap.keys()])];

  const merged = allSymbols.map((symbol) => {
    const a = openaiMap.get(symbol);
    const b = claudeMap.get(symbol);
    const primary = a ?? b;
    if (!primary) return null;

    if (a && b) {
      const avgConfidence = Math.min(0.99, (a.confidence + b.confidence) / 2 + 0.03);
      const avgRisk = [a.riskLevel, b.riskLevel].sort((x, y) => getRiskRank(x) - getRiskRank(y))[0] ?? "moderate";
      return {
        ...primary,
        confidence: Number(avgConfidence.toFixed(3)),
        entryZoneLow: Number(((a.entryZoneLow + b.entryZoneLow) / 2).toFixed(2)),
        entryZoneHigh: Number(((a.entryZoneHigh + b.entryZoneHigh) / 2).toFixed(2)),
        targetPrice: Number(((a.targetPrice + b.targetPrice) / 2).toFixed(2)),
        stopLoss: Number(((a.stopLoss + b.stopLoss) / 2).toFixed(2)),
        riskLevel: avgRisk,
        riskRewardRatio: a.riskRewardRatio,
        maxLossDollar: Number(((a.maxLossDollar + b.maxLossDollar) / 2).toFixed(2)),
        maxGainDollar: Number(((a.maxGainDollar + b.maxGainDollar) / 2).toFixed(2)),
        reasoning: [
          `Consensus from OpenAI and Claude.`,
          `OpenAI: ${a.reasoning}`,
          `Claude: ${b.reasoning}`,
        ].join(" "),
        keyMetrics: mergeMetrics(a.keyMetrics, b.keyMetrics),
        sourceModels: ["openai", "claude"],
        agreementScore: 2,
      };
    }

    return {
      ...primary,
      sourceModels: [a ? "openai" : "claude"],
      agreementScore: 1,
    };
  }).filter(Boolean) as ScanPick[];

  return merged.sort((a, b) => {
    const agreementDelta = (b.agreementScore ?? 0) - (a.agreementScore ?? 0);
    if (agreementDelta !== 0) return agreementDelta;
    if ((b.confidence ?? 0) !== (a.confidence ?? 0)) return (b.confidence ?? 0) - (a.confidence ?? 0);
    return (b.setupQualityScore ?? 0) - (a.setupQualityScore ?? 0);
  });
}

async function runAndPersistModel(
  model: "openai" | "claude",
  stocks: StockRow[],
  stockMap: Record<string, EnrichedStockRow>
): Promise<ModelRunResult> {
  const raw = model === "claude" ? await callClaude(stocks) : await callOpenAI(stocks);
  const normalized = ((raw.picks ?? []) as RawModelPick[])
    .map((pick) => normalizePick(pick, stockMap))
    .filter((pick): pick is Omit<ScanPick, "signalId" | "sourceModels" | "agreementScore"> => Boolean(pick));

  const saved = await saveScanSignals(normalized, raw.model ?? model, raw.estimatedCostUsd ?? 0);
  const picks: ScanPick[] = normalized.map((pick, idx) => ({
    ...pick,
    signalId: saved[idx]?.signalId ?? null,
  }));

  return {
    model: raw.model ?? model,
    summary: raw.summary ?? "",
    picks,
    estimatedInputTokens: raw.estimatedInputTokens,
    estimatedOutputTokens: raw.estimatedOutputTokens,
    estimatedCostUsd: raw.estimatedCostUsd,
  };
}

export async function POST(req: NextRequest) {
  const { model }: { model: ScanModel } = await req.json();

  if (!["claude", "openai", "compare"].includes(model))
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  if (model === "claude" && !process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  if (model === "openai" && !process.env.OPENAI_API_KEY)
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  if (model === "compare" && !process.env.OPENAI_API_KEY)
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  if (model === "compare" && !process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  const stocks: StockRow[] = await fetchTopStocks();
  const enrichedStocks = await enrichStockUniverse(stocks);
  const stockMap = Object.fromEntries(enrichedStocks.map((s) => [s.symbol, s])) as Record<string, EnrichedStockRow>;
  if (model === "compare") {
    const [openai, claude] = await Promise.all([
      runAndPersistModel("openai", enrichedStocks, stockMap),
      runAndPersistModel("claude", enrichedStocks, stockMap),
    ]);
    const openaiSymbols = new Set(openai.picks.map((pick) => pick.symbol));
    const claudeSymbols = new Set(claude.picks.map((pick) => pick.symbol));
    const overlap = [...openaiSymbols].filter((symbol) => claudeSymbols.has(symbol));
    const merged = mergeModelRuns(openai, claude);
    const totalCost = (openai.estimatedCostUsd ?? 0) + (claude.estimatedCostUsd ?? 0);

    return NextResponse.json({
      model: "compare",
      summary: `OpenAI found ${openai.picks.length} picks, Claude found ${claude.picks.length} picks, and they overlapped on ${overlap.length}. Consensus picks are boosted to the top.`,
      picks: merged,
      scannedAt: new Date().toISOString(),
      estimatedInputTokens: (openai.estimatedInputTokens ?? 0) + (claude.estimatedInputTokens ?? 0),
      estimatedOutputTokens: (openai.estimatedOutputTokens ?? 0) + (claude.estimatedOutputTokens ?? 0),
      estimatedCostUsd: totalCost,
      comparison: {
        openai,
        claude,
        overlapCount: overlap.length,
        openaiOnly: openai.picks.filter((pick) => !claudeSymbols.has(pick.symbol)).map((pick) => pick.symbol),
        claudeOnly: claude.picks.filter((pick) => !openaiSymbols.has(pick.symbol)).map((pick) => pick.symbol),
        consensusSummary: overlap.length > 0
          ? `Consensus: ${overlap.join(", ")}`
          : "No direct overlap yet. The models are seeing different edges.",
      },
    } as ScanResult);
  }

  const single = await runAndPersistModel(model, enrichedStocks, stockMap);
  return NextResponse.json({
    ...single,
    scannedAt: new Date().toISOString(),
  } as ScanResult);
}
