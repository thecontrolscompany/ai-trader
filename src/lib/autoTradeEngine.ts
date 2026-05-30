/**
 * Auto-trade engine — paper trading only. No real money is ever used.
 *
 * Flow:
 * 1. Load settings + check enabled
 * 2. Run AI scan to get picks
 * 3. For each pick above confidence threshold:
 *    - Skip if already have open position in this ticker
 *    - Skip if daily trade limit reached
 *    - Skip if brokerage has insufficient funds
 *    - Open paper trade
 * 4. If auto_close enabled: check every open position against current price,
 *    close if stop loss or take profit is hit
 */

import { db } from "@/db";
import { accounts, autoTradeLog, autoTradeSettings, trades } from "@/db/schema";
import { BROKERAGE_ID } from "@/lib/accounts";
import { getEasternTime, isMarketHours, isWithinRunWindow } from "@/lib/autoTradeSchedule";
import { calcSellFees } from "@/lib/fees";
import { newId } from "@/lib/id";
import { fetchTopStocks } from "@/lib/fetchStocks";
import { calcShares } from "@/lib/shares";
import { saveScanSignals } from "@/lib/roiTracker";
import { eq, and, gte, sql } from "drizzle-orm";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000010";

export interface AutoTradeResult {
  opened: string[];
  closed: string[];
  skipped: string[];
  errors: string[];
  summary: string;
}

async function log(action: string, ticker?: string, tradeId?: string, reason?: string) {
  await db.insert(autoTradeLog).values({
    id: newId(), action,
    ticker: ticker ?? null,
    tradeId: tradeId ?? null,
    reason: reason ?? null,
  });
}

async function getDailyTradeCount(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = await db.select({ count: sql<number>`count(*)` })
    .from(autoTradeLog)
    .where(and(eq(autoTradeLog.action, "opened"), gte(autoTradeLog.createdAt, today)));
  return Number(rows[0]?.count ?? 0);
}

async function getAccountBalance(accountId: string): Promise<number> {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  return row?.balance ?? 0;
}

async function getOrCreateSettingsRow() {
  let [settings] = await db.select().from(autoTradeSettings).where(eq(autoTradeSettings.id, SETTINGS_ID)).limit(1);
  if (!settings) {
    [settings] = await db.insert(autoTradeSettings).values({ id: SETTINGS_ID }).returning();
  }
  return settings;
}

export async function runAutoTrade(force = false): Promise<AutoTradeResult> {
  const result: AutoTradeResult = { opened: [], closed: [], skipped: [], errors: [], summary: "" };

  // Load settings — create defaults if row is missing
  const settings = await getOrCreateSettingsRow();
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
    await log("skipped", undefined, undefined, "Market closed");
    return result;
  }

  const dailyCount = await getDailyTradeCount();
  const maxDaily   = Math.floor(settings.maxTradesPerDay);

  // ── Auto-close: check stop loss / take profit on open positions ─────────
  if (settings.autoClose === "true") {
    const openTrades = await db.select().from(trades).where(eq(trades.status, "open"));
    for (const trade of openTrades) {
      try {
        const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${trade.ticker}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const json = await res.json();
        const price: number = json?.quoteResponse?.result?.[0]?.regularMarketPrice ?? 0;
        if (!price) continue;

        let shouldClose = false;
        let closeReason = "";

        const isLong = trade.direction === "long";
        if (trade.stopLoss  && (isLong ? price <= trade.stopLoss  : price >= trade.stopLoss))  { shouldClose = true; closeReason = `Stop loss hit @ $${price.toFixed(2)}`; }
        if (trade.takeProfit && (isLong ? price >= trade.takeProfit : price <= trade.takeProfit)) { shouldClose = true; closeReason = `Take profit hit @ $${price.toFixed(2)}`; }

        if (shouldClose) {
          const sellFees   = calcSellFees(price, trade.quantity);
          const netProceeds = price * trade.quantity - sellFees;
          const [brokerage] = await db.select().from(accounts).where(eq(accounts.id, BROKERAGE_ID)).limit(1);
          const pnl = netProceeds - trade.entryPrice * trade.quantity;

          await Promise.all([
            db.update(trades).set({
              status: "closed", exitPrice: price,
              closedAt: new Date(), fees: (trade.fees ?? 0) + sellFees,
            }).where(eq(trades.id, trade.id)),
            db.update(accounts).set({ balance: brokerage.balance + netProceeds }).where(eq(accounts.id, BROKERAGE_ID)),
          ]);

          await log("closed", trade.ticker, trade.id, `${closeReason} · P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`);
          result.closed.push(`${trade.ticker} (${closeReason})`);
        }
      } catch (e) {
        result.errors.push(`Auto-close ${trade.ticker}: ${e}`);
      }
    }
  }

  // ── Auto-open: run AI scan and open qualifying trades ──────────────────
  if (dailyCount >= maxDaily) {
    result.summary = `Daily trade limit (${maxDaily}) reached. ${result.closed.length} positions auto-closed.`;
    return result;
  }

  let picks: { model?: string; picks?: Record<string, unknown>[]; estimatedCostUsd?: number } | null = null;
  try {
    const stocks = await fetchTopStocks();
    const { callClaude, callOpenAI } = await import("@/lib/scanHelpers");
    picks = settings.model === "claude"
      ? await callClaude(stocks)
      : await callOpenAI(stocks);
  } catch (e) {
    result.errors.push(`AI scan failed: ${e}`);
    result.summary = "AI scan failed — check API keys.";
    return result;
  }

  const normalized = ((picks?.picks ?? []) as Record<string, unknown>[])
    .map((pick) => ({
      symbol: String(pick.symbol ?? ""),
      direction: (pick.direction as "long" | "short" | "neutral") ?? "long",
      entryZoneLow: Number(pick.entryZoneLow ?? 0),
      entryZoneHigh: Number(pick.entryZoneHigh ?? pick.entryZoneLow ?? 0),
      targetPrice: Number(pick.targetPrice ?? 0),
      stopLoss: Number(pick.stopLoss ?? 0),
      timeHorizon: String(pick.timeHorizon ?? "unknown"),
      confidence: Number(pick.confidence ?? 0.5),
      reasoning: String(pick.reasoning ?? ""),
      riskLevel: String(pick.riskLevel ?? "moderate"),
    }))
    .filter((pick) => pick.symbol && pick.entryZoneLow > 0);

  const saved = await saveScanSignals(
    normalized,
    picks?.model ?? settings.model,
    picks?.estimatedCostUsd ?? 0
  );

  const openTickers = new Set(
    (await db.select().from(trades).where(eq(trades.status, "open"))).map((t) => t.ticker)
  );
  const brokerBalance = await getAccountBalance(BROKERAGE_ID);
  let remaining = maxDaily - dailyCount;
  let availableBalance = brokerBalance;

  // Filter qualifying picks up-front so we can size positions intelligently
  const qualifyingPicks = saved.filter((pick) => {
    if (Number(pick.confidence ?? 0) < settings.minConfidence) return false;
    if (openTickers.has(String(pick.symbol))) return false;
    return true;
  }).slice(0, remaining);

  const deployMode   = (settings as any).deployMode ?? "spread";
  let remainingSlots = Math.max(1, qualifyingPicks.length);

  for (const pick of qualifyingPicks) {
    if (remaining <= 0) break;

    // Recalculate per-slot each iteration so undeployed cash rolls forward
    const perSlot = deployMode === "fixed"
      ? availableBalance * settings.maxPositionPct
      : availableBalance / remainingSlots;

    // Fetch actual current price so entry matches real market — avoids phantom P&L
    let entryPrice = Number(pick.entryZoneLow);
    try {
      const qr = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${pick.symbol}`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      const qj = await qr.json();
      const livePrice = qj?.quoteResponse?.result?.[0]?.regularMarketPrice;
      if (livePrice) entryPrice = Number(livePrice);
    } catch { /* keep AI suggested price */ }
    const invest     = Math.min(perSlot, availableBalance);
    const qty        = calcShares(invest, entryPrice);
    if (invest < 1 || availableBalance < 1) {
      result.skipped.push(`${pick.symbol} (insufficient brokerage funds)`);
      continue;
    }

    try {
      const tradeId = newId();
      await db.insert(trades).values({
        id: tradeId, ticker: String(pick.symbol), assetClass: "stock",
        direction: pick.direction === "short" ? "short" : "long",
        status: "open", entryPrice, quantity: qty,
        stopLoss: pick.stopLoss ?? null, takeProfit: pick.targetPrice ?? null,
        fees: 0, notes: `[AUTO] ${pick.reasoning?.slice(0, 200) ?? ""}`,
        aiSignalId: pick.signalId ?? null,
      });
      availableBalance -= invest;
      remainingSlots = Math.max(1, remainingSlots - 1);
      await db.update(accounts).set({ balance: availableBalance }).where(eq(accounts.id, BROKERAGE_ID));
      await log("opened", pick.symbol, tradeId,
        `Confidence ${(Number(pick.confidence) * 100).toFixed(0)}% · ${pick.riskLevel ?? "moderate"} risk · invested $${invest.toFixed(2)}`);
      openTickers.add(pick.symbol);
      result.opened.push(`${pick.symbol} — ${qty.toFixed(4)} shares @ $${entryPrice.toFixed(2)} ($${invest.toFixed(2)})`);
      remaining--;
    } catch (e) {
      remainingSlots = Math.max(1, remainingSlots - 1);
      result.errors.push(`Open ${pick.symbol}: ${e}`);
    }
  }

  result.summary = [
    result.opened.length   && `Opened: ${result.opened.join(", ")}`,
    result.closed.length   && `Closed: ${result.closed.join(", ")}`,
    result.skipped.length  && `Skipped ${result.skipped.length} picks`,
    result.errors.length   && `${result.errors.length} error(s)`,
  ].filter(Boolean).join(" · ") || "Scan complete — no trades this run.";

  // Save summary to settings
  await db.update(autoTradeSettings).set({
    lastRunAt: new Date(), lastRunSummary: result.summary,
  }).where(eq(autoTradeSettings.id, SETTINGS_ID));

  return result;
}
