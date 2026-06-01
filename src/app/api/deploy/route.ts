import { db } from "@/db";
import { accounts, aiModels, trades } from "@/db/schema";
import { requirePortfolio, getPortfolioAccountIds } from "@/lib/portfolio";
import { getActiveModel } from "@/lib/activeModel";
import { calcBuyFees } from "@/lib/fees";
import { fetchTopStocks } from "@/lib/fetchStocks";
import { callClaude, callOpenAI } from "@/lib/scanHelpers";
import { calcShares } from "@/lib/shares";
import { getQuote } from "@/lib/marketProvider";
import { newId } from "@/lib/id";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export interface DeployPick {
  symbol: string; name: string; direction: "long" | "short";
  entryPrice: number; targetPrice: number; stopLoss: number;
  confidence: number; riskLevel: string; reasoning: string;
  invest: number; shares: number; signalId?: string | null;
}

export async function POST(req: NextRequest) {
  const r = await requirePortfolio();
  if ("error" in r) return r.error;
  const { portfolioId } = r;
  const body = await req.json();

  const { brokerageId } = await getPortfolioAccountIds(portfolioId);

  if (body.action === "preview") {
    // Resolve model: use specific model ID if provided (admin testing), otherwise use active model
    let selectedModel = await getActiveModel();
    if (body.modelId) {
      const [override] = await db.select().from(aiModels).where(eq(aiModels.id, body.modelId)).limit(1);
      if (override) selectedModel = override;
    }

    const [brokerage] = await db.select().from(accounts).where(eq(accounts.id, brokerageId)).limit(1);
    const balance = brokerage?.balance ?? 0;
    if (balance < 1) return NextResponse.json({ error: "Brokerage balance is $0. Deposit funds first." }, { status: 400 });

    const openTickers = new Set((await db.select().from(trades).where(eq(trades.portfolioId, portfolioId))).filter(t => t.status === "open").map(t => t.ticker));
    const stocks = await fetchTopStocks();
    const raw = selectedModel.provider === "claude" ? await callClaude(stocks, selectedModel.customPrompt ?? undefined) : await callOpenAI(stocks, selectedModel.customPrompt ?? undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qualifying = ((raw.picks ?? []) as any[])
      .filter((p) => p.symbol && p.entryZoneLow > 0 && !openTickers.has(String(p.symbol)) && Number(p.confidence ?? 0) >= 0.60)
      .slice(0, 10);

    if (!qualifying.length) return NextResponse.json({ error: "No qualifying picks found. Try again." }, { status: 400 });

    const perSlot = balance / qualifying.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const picks: DeployPick[] = qualifying.map((p: any) => {
      const entryPrice = Number(p.entryZoneLow);
      const invest = Math.floor(perSlot * 100) / 100;
      return {
        symbol: String(p.symbol), name: String(p.name ?? p.symbol),
        direction: p.direction === "short" ? "short" : "long",
        entryPrice, targetPrice: Number(p.targetPrice ?? entryPrice * 1.1),
        stopLoss: Number(p.stopLoss ?? entryPrice * 0.95),
        confidence: Number(p.confidence ?? 0.7), riskLevel: String(p.riskLevel ?? "moderate"),
        reasoning: String(p.reasoning ?? "").slice(0, 300),
        invest, shares: calcShares(invest, entryPrice),
        signalId: p.signalId ?? null,
      };
    });

    return NextResponse.json({ balance, totalInvest: picks.reduce((s, p) => s + p.invest, 0), picks, model: raw.model ?? selectedModel.name, summary: raw.summary ?? "" });
  }

  if (body.action === "execute") {
    const picks: DeployPick[] = body.picks ?? [];
    if (!picks.length) return NextResponse.json({ error: "No picks provided" }, { status: 400 });

    const [brokerage] = await db.select().from(accounts).where(eq(accounts.id, brokerageId)).limit(1);
    let balance = brokerage?.balance ?? 0;
    const opened: string[] = []; const errors: string[] = [];

    // Fetch live prices via Tradier for all picks in parallel
    const priceMap: Record<string, number> = {};
    await Promise.all(picks.map(async (p) => {
      try {
        const q = await getQuote(p.symbol);
        if (q?.price) priceMap[p.symbol] = q.price;
      } catch { /* fallback to preview entry price */ }
    }));

    for (const pick of picks) {
      try {
        const actualEntry = priceMap[pick.symbol] ?? pick.entryPrice;
        const qty = calcShares(pick.invest, actualEntry);
        if (qty < 1) { errors.push(`${pick.symbol}: price too high for available budget`); continue; }
        const actualCost = qty * actualEntry + calcBuyFees();
        if (balance < actualCost) { errors.push(`${pick.symbol}: insufficient funds`); continue; }
        await db.insert(trades).values({
          id: newId(), portfolioId, ticker: pick.symbol, assetClass: "stock",
          direction: pick.direction, status: "open", entryPrice: actualEntry,
          quantity: qty,
          stopLoss: pick.stopLoss, takeProfit: pick.targetPrice,
          fees: calcBuyFees(), notes: `[DEPLOY] ${pick.reasoning}`,
          aiSignalId: pick.signalId ?? null,
        });
        balance -= actualCost;
        opened.push(pick.symbol);
      } catch (e) { errors.push(`${pick.symbol}: ${e}`); }
    }

    await db.update(accounts).set({ balance }).where(eq(accounts.id, brokerageId));
    return NextResponse.json({ opened, errors, remainingBalance: balance });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
