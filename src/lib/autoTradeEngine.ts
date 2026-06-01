import { db } from "@/db";
import { accounts, autoTradeLog, autoTradeSettings, trades } from "@/db/schema";
import { getPortfolioAccountIds } from "@/lib/portfolio";
import { getEasternTime, isMarketHours, isWithinRunWindow } from "@/lib/autoTradeSchedule";
import { calcSellFees } from "@/lib/fees";
import { newId } from "@/lib/id";
import { fetchTopStocks } from "@/lib/fetchStocks";
import { calcShares } from "@/lib/shares";
import { saveScanSignals } from "@/lib/roiTracker";
import { eq, and, gte, sql } from "drizzle-orm";

export interface AutoTradeResult {
  opened: string[];
  closed: string[];
  skipped: string[];
  errors: string[];
  summary: string;
}

async function logAction(portfolioId: string, action: string, ticker?: string, tradeId?: string, reason?: string) {
  await db.insert(autoTradeLog).values({
    id: newId(), portfolioId, action,
    ticker: ticker ?? null, tradeId: tradeId ?? null, reason: reason ?? null,
  });
}

async function getDailyCount(portfolioId: string): Promise<number> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = await db.select({ count: sql<number>`count(*)` })
    .from(autoTradeLog)
    .where(and(eq(autoTradeLog.portfolioId, portfolioId), eq(autoTradeLog.action, "opened"), gte(autoTradeLog.createdAt, today)));
  return Number(rows[0]?.count ?? 0);
}

async function getOrCreateSettings(portfolioId: string) {
  let [s] = await db.select().from(autoTradeSettings).where(eq(autoTradeSettings.portfolioId, portfolioId)).limit(1);
  if (!s) [s] = await db.insert(autoTradeSettings).values({ id: newId(), portfolioId }).returning();
  return s;
}

/** Cron: run for all enabled portfolios. */
export async function runAutoTradeForAllPortfolios(): Promise<Record<string, AutoTradeResult>> {
  const et = getEasternTime();
  const allSettings = await db.select().from(autoTradeSettings).where(eq(autoTradeSettings.enabled, "true"));
  const results: Record<string, AutoTradeResult> = {};
  for (const s of allSettings) {
    if (!isWithinRunWindow(s.scanFrequency ?? "4x", et)) continue;
    results[s.portfolioId] = await runAutoTradeForPortfolio(s.portfolioId, false);
  }
  return results;
}

export async function runAutoTradeForPortfolio(portfolioId: string, force = false): Promise<AutoTradeResult> {
  const result: AutoTradeResult = { opened: [], closed: [], skipped: [], errors: [], summary: "" };

  const settings = await getOrCreateSettings(portfolioId);
  if (!settings || settings.enabled !== "true") {
    result.summary = "Auto-trading is disabled.";
    return result;
  }

  const et = getEasternTime();

  if (!force && !isWithinRunWindow(settings.scanFrequency ?? "4x", et)) {
    result.summary = "Outside the configured scan window.";
    return result;
  }

  if (!force && !isMarketHours(et)) {
    result.summary = "Market is closed — no trades placed.";
    await logAction(portfolioId, "skipped", undefined, undefined, "Market closed");
    return result;
  }

  const dailyCount = await getDailyCount(portfolioId);
  const maxDaily   = Math.floor(settings.maxTradesPerDay);
  const { brokerageId } = await getPortfolioAccountIds(portfolioId);

  // ── Auto-close ────────────────────────────────────────────────────────────
  if (settings.autoClose === "true") {
    const openTrades = await db.select().from(trades)
      .where(and(eq(trades.portfolioId, portfolioId), eq(trades.status, "open")));
    for (const trade of openTrades) {
      try {
        const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${trade.ticker}`, { headers: { "User-Agent": "Mozilla/5.0" } });
        const price: number = (await res.json())?.quoteResponse?.result?.[0]?.regularMarketPrice ?? 0;
        if (!price) continue;
        const isLong = trade.direction === "long";
        let shouldClose = false; let closeReason = "";
        if (trade.stopLoss   && (isLong ? price <= trade.stopLoss   : price >= trade.stopLoss))   { shouldClose = true; closeReason = `Stop loss hit @ $${price.toFixed(2)}`; }
        if (trade.takeProfit && (isLong ? price >= trade.takeProfit : price <= trade.takeProfit))  { shouldClose = true; closeReason = `Take profit hit @ $${price.toFixed(2)}`; }
        if (shouldClose) {
          const sellFees = calcSellFees(price, trade.quantity);
          const net = price * trade.quantity - sellFees;
          const [brok] = await db.select().from(accounts).where(eq(accounts.id, brokerageId)).limit(1);
          const pnl = net - trade.entryPrice * trade.quantity;
          await Promise.all([
            db.update(trades).set({ status: "closed", exitPrice: price, closedAt: new Date(), fees: (trade.fees ?? 0) + sellFees }).where(eq(trades.id, trade.id)),
            db.update(accounts).set({ balance: brok.balance + net }).where(eq(accounts.id, brokerageId)),
          ]);
          await logAction(portfolioId, "closed", trade.ticker, trade.id, `${closeReason} · P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`);
          result.closed.push(`${trade.ticker} (${closeReason})`);
        }
      } catch (e) { result.errors.push(`Auto-close ${trade.ticker}: ${e}`); }
    }
  }

  // ── Auto-open ─────────────────────────────────────────────────────────────
  if (dailyCount >= maxDaily) {
    result.summary = `Daily trade limit (${maxDaily}) reached. ${result.closed.length} positions auto-closed.`;
    return result;
  }

  let picks: { model?: string; picks?: Record<string, unknown>[]; estimatedCostUsd?: number } | null = null;
  try {
    const stocks = await fetchTopStocks();
    const { callClaude, callOpenAI } = await import("@/lib/scanHelpers");
    if (settings.model === "compare") {
      // Run both models, merge picks — dedup by symbol keeping highest confidence
      const [claudeResult, openaiResult] = await Promise.all([callClaude(stocks), callOpenAI(stocks)]);
      const allPicks = [...(claudeResult.picks ?? []), ...(openaiResult.picks ?? [])];
      const bySymbol = new Map<string, Record<string, unknown>>();
      for (const p of allPicks) {
        const sym = String(p.symbol ?? "");
        const existing = bySymbol.get(sym);
        if (!existing || Number(p.confidence ?? 0) > Number(existing.confidence ?? 0)) {
          bySymbol.set(sym, p);
        }
      }
      picks = {
        model: "Claude + GPT-4o",
        picks: [...bySymbol.values()],
        estimatedCostUsd: (claudeResult.estimatedCostUsd ?? 0) + (openaiResult.estimatedCostUsd ?? 0),
      };
    } else {
      picks = settings.model === "claude" ? await callClaude(stocks) : await callOpenAI(stocks);
    }
  } catch (e) {
    result.errors.push(`AI scan failed: ${e}`);
    result.summary = "AI scan failed — check API keys.";
    return result;
  }

  const normalized = ((picks?.picks ?? []) as Record<string, unknown>[])
    .map((p) => ({ symbol: String(p.symbol ?? ""), direction: (p.direction as "long" | "short" | "neutral") ?? "long", entryZoneLow: Number(p.entryZoneLow ?? 0), entryZoneHigh: Number(p.entryZoneHigh ?? p.entryZoneLow ?? 0), targetPrice: Number(p.targetPrice ?? 0), stopLoss: Number(p.stopLoss ?? 0), timeHorizon: String(p.timeHorizon ?? "unknown"), confidence: Number(p.confidence ?? 0.5), reasoning: String(p.reasoning ?? ""), riskLevel: String(p.riskLevel ?? "moderate") }))
    .filter((p) => p.symbol && p.entryZoneLow > 0);

  const saved = await saveScanSignals(normalized, picks?.model ?? settings.model, picks?.estimatedCostUsd ?? 0);

  const openTickers = new Set((await db.select().from(trades).where(and(eq(trades.portfolioId, portfolioId), eq(trades.status, "open")))).map((t) => t.ticker));
  const [brokerRow] = await db.select().from(accounts).where(eq(accounts.id, brokerageId)).limit(1);
  let available = brokerRow?.balance ?? 0;
  let remaining = maxDaily - dailyCount;

  const qualifying = saved.filter((p) => Number(p.confidence ?? 0) >= settings.minConfidence && !openTickers.has(String(p.symbol))).slice(0, remaining);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deployMode = (settings as any).deployMode ?? "spread";
  let slots = Math.max(1, qualifying.length);

  for (const pick of qualifying) {
    if (remaining <= 0) break;
    const perSlot = deployMode === "fixed" ? available * settings.maxPositionPct : available / slots;
    let entryPrice = Number(pick.entryZoneLow);
    try {
      const { getQuote } = await import("@/lib/marketProvider");
      const q = await getQuote(String(pick.symbol));
      if (q?.price) entryPrice = q.price;
    } catch { /* keep AI price */ }
    const invest = Math.min(perSlot, available);
    const qty = calcShares(invest, entryPrice);
    if (invest < 1 || available < 1) { result.skipped.push(`${pick.symbol} (insufficient funds)`); slots = Math.max(1, slots - 1); continue; }
    try {
      const tradeId = newId();
      await db.insert(trades).values({
        id: tradeId, portfolioId, ticker: String(pick.symbol), assetClass: "stock",
        direction: pick.direction === "short" ? "short" : "long",
        status: "open", entryPrice, quantity: qty,
        stopLoss: pick.stopLoss ?? null, takeProfit: pick.targetPrice ?? null,
        fees: 0, notes: `[AUTO] ${String(pick.reasoning ?? "").slice(0, 200)}`,
        aiSignalId: pick.signalId ?? null,
      });
      available -= invest; slots = Math.max(1, slots - 1);
      await db.update(accounts).set({ balance: available }).where(eq(accounts.id, brokerageId));
      await logAction(portfolioId, "opened", String(pick.symbol), tradeId, `Confidence ${(Number(pick.confidence) * 100).toFixed(0)}% · ${pick.riskLevel ?? "moderate"} · $${invest.toFixed(2)}`);
      openTickers.add(String(pick.symbol));
      result.opened.push(`${pick.symbol} — ${qty} shares @ $${entryPrice.toFixed(2)} ($${(qty * entryPrice).toFixed(2)})`);
      remaining--;
    } catch (e) { slots = Math.max(1, slots - 1); result.errors.push(`Open ${pick.symbol}: ${e}`); }
  }

  result.summary = [result.opened.length && `Opened: ${result.opened.join(", ")}`, result.closed.length && `Closed: ${result.closed.join(", ")}`, result.skipped.length && `Skipped ${result.skipped.length}`, result.errors.length && `${result.errors.length} error(s)`].filter(Boolean).join(" · ") || "Scan complete — no trades this run.";
  await db.update(autoTradeSettings).set({ lastRunAt: new Date(), lastRunSummary: result.summary }).where(eq(autoTradeSettings.portfolioId, portfolioId));
  return result;
}
