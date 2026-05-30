import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { aiSignals, trades, type NewAISignal } from "@/db/schema";
import { newId } from "@/lib/id";

export type ScanProvider = "openai" | "claude";

export interface ScanSignalInput {
  symbol: string;
  direction: "long" | "short" | "neutral";
  entryZoneLow: number;
  entryZoneHigh: number;
  targetPrice: number;
  stopLoss: number;
  timeHorizon: string;
  confidence: number;
  reasoning: string;
}

export type SavedScanSignal<T extends ScanSignalInput> = T & {
  signalId: string | null;
};

const DEFAULT_COSTS_PER_1M_TOKENS: Record<ScanProvider, { input: number; output: number }> = {
  openai: {
    input: Number(process.env.OPENAI_INPUT_COST_PER_1M_TOKENS ?? 5),
    output: Number(process.env.OPENAI_OUTPUT_COST_PER_1M_TOKENS ?? 15),
  },
  claude: {
    input: Number(process.env.ANTHROPIC_INPUT_COST_PER_1M_TOKENS ?? 3),
    output: Number(process.env.ANTHROPIC_OUTPUT_COST_PER_1M_TOKENS ?? 15),
  },
};

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateScanSpend(provider: ScanProvider, promptText: string, responseText: string) {
  const inputTokens = estimateTokens(promptText);
  const outputTokens = estimateTokens(responseText);
  const rates = DEFAULT_COSTS_PER_1M_TOKENS[provider];
  const estimatedCostUsd =
    (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
  };
}

export async function saveScanSignals<T extends ScanSignalInput>(
  picks: T[],
  model: string,
  estimatedCostUsd = 0
): Promise<Array<SavedScanSignal<T>>> {
  const perSignalCost = picks.length > 0 ? estimatedCostUsd / picks.length : 0;
  const saved: Array<SavedScanSignal<T>> = [];

  for (const pick of picks) {
    const signalId = newId();
    try {
      await db.insert(aiSignals).values({
        id: signalId,
        ticker: pick.symbol,
        model,
        direction: pick.direction,
        entryZoneLow: pick.entryZoneLow,
        entryZoneHigh: pick.entryZoneHigh,
        targetPrice: pick.targetPrice,
        stopLoss: pick.stopLoss,
        timeHorizon: pick.timeHorizon,
        confidence: pick.confidence,
        reasoning: pick.reasoning,
        estimatedScanCostUsd: Number(perSignalCost.toFixed(6)),
      } satisfies NewAISignal);
      saved.push({ ...pick, signalId });
    } catch {
      saved.push({ ...pick, signalId: null });
    }
  }

  return saved;
}

export interface AiRoiModelSummary {
  model: string;
  signalCount: number;
  closedTradeCount: number;
  estimatedSpend: number;
  realizedPnl: number;
  netAfterCost: number;
  roiPct: number | null;
}

export interface AiRoiSummary {
  signalCount: number;
  closedTradeCount: number;
  estimatedSpend: number;
  realizedPnl: number;
  netAfterCost: number;
  roiPct: number | null;
  breakevenPnl: number;
  untrackedClosedTrades: number;
  byModel: AiRoiModelSummary[];
  summary: string;
  highlights: string[];
}

function realizedPnl(row: {
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  fees: number | null;
}): number {
  if (row.exitPrice == null) return 0;
  const perShare = row.direction === "short"
    ? row.entryPrice - row.exitPrice
    : row.exitPrice - row.entryPrice;
  return perShare * row.quantity - (row.fees ?? 0);
}

export async function getAiRoiSummary(limit = 500): Promise<AiRoiSummary> {
  const signals = await db.select({
    id: aiSignals.id,
    model: aiSignals.model,
    estimatedScanCostUsd: aiSignals.estimatedScanCostUsd,
    createdAt: aiSignals.createdAt,
  }).from(aiSignals).orderBy(desc(aiSignals.createdAt)).limit(limit);

  const closedTrades = await db.select({
    aiSignalId: trades.aiSignalId,
    direction: trades.direction,
    entryPrice: trades.entryPrice,
    exitPrice: trades.exitPrice,
    quantity: trades.quantity,
    fees: trades.fees,
  })
    .from(trades)
    .where(and(eq(trades.status, "closed"), isNotNull(trades.exitPrice), isNotNull(trades.aiSignalId)))
    .orderBy(desc(trades.closedAt))
    .limit(limit);

  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  const byModel = new Map<string, AiRoiModelSummary>();

  const seedModel = (model: string) => {
    const existing = byModel.get(model);
    if (existing) return existing;
    const created = {
      model,
      signalCount: 0,
      closedTradeCount: 0,
      estimatedSpend: 0,
      realizedPnl: 0,
      netAfterCost: 0,
      roiPct: null as number | null,
    };
    byModel.set(model, created);
    return created;
  };

  let estimatedSpend = 0;
  for (const signal of signals) {
    const bucket = seedModel(signal.model);
    bucket.signalCount += 1;
    bucket.estimatedSpend += signal.estimatedScanCostUsd ?? 0;
    estimatedSpend += signal.estimatedScanCostUsd ?? 0;
  }

  let realized = 0;
  let untrackedClosedTrades = 0;
  for (const trade of closedTrades) {
    const signal = trade.aiSignalId ? signalById.get(trade.aiSignalId) : null;
    if (!signal) {
      untrackedClosedTrades += 1;
      continue;
    }

    const pnl = realizedPnl(trade);
    realized += pnl;
    const bucket = seedModel(signal.model);
    bucket.closedTradeCount += 1;
    bucket.realizedPnl += pnl;
  }

  const orderedModels = [...byModel.values()]
    .map((model) => {
      const netAfterCost = model.realizedPnl - model.estimatedSpend;
      return {
        ...model,
        netAfterCost,
        roiPct: model.estimatedSpend > 0 ? (netAfterCost / model.estimatedSpend) * 100 : null,
      };
    })
    .filter((model) => model.signalCount > 0)
    .sort((a, b) => b.netAfterCost - a.netAfterCost);

  const netAfterCost = realized - estimatedSpend;
  const roiPct = estimatedSpend > 0 ? (netAfterCost / estimatedSpend) * 100 : null;
  const primaryModel = orderedModels[0];

  const highlights = [
    `Estimated AI spend: $${estimatedSpend.toFixed(2)} across ${signals.length} signal(s).`,
    `Realized P&L from linked closed trades: ${realized >= 0 ? "+" : ""}$${realized.toFixed(2)}.`,
    `Net after AI spend: ${netAfterCost >= 0 ? "+" : ""}$${netAfterCost.toFixed(2)}${roiPct != null ? ` (${roiPct >= 0 ? "+" : ""}${roiPct.toFixed(1)}% ROI)` : ""}.`,
  ];

  if (primaryModel) {
    highlights.push(
      `Best model so far: ${primaryModel.model} with ${primaryModel.signalCount} signal(s), ${primaryModel.closedTradeCount} closed trade(s), and ${primaryModel.netAfterCost >= 0 ? "+" : ""}$${primaryModel.netAfterCost.toFixed(2)} net after estimated cost.`
    );
  }

  return {
    signalCount: signals.length,
    closedTradeCount: closedTrades.length,
    estimatedSpend,
    realizedPnl: realized,
    netAfterCost,
    roiPct,
    breakevenPnl: estimatedSpend,
    untrackedClosedTrades,
    byModel: orderedModels,
    summary:
      "This tracker compares estimated model spend against realized P&L from linked closed trades. If net after model cost is positive, the scanning pipeline is paying for itself.",
    highlights,
  };
}
