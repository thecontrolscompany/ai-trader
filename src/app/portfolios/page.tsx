import { db } from "@/db";
import { accounts, autoTradeSettings, aiModels, trades, portfolios, portfolioSnapshots } from "@/db/schema";
import { getActivePortfolio } from "@/lib/portfolio";
import { getQuotes } from "@/lib/marketProvider";
import { auth } from "@/auth";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import PortfolioActions from "./PortfolioActions";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function pctStr(n: number) {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}
function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export default async function PortfoliosPage() {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) redirect("/login");

  const activePortfolio = await getActivePortfolio();
  const userPortfolios = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  if (userPortfolios.length === 0) redirect("/accounts");

  const portfolioIds = userPortfolios.map(p => p.id);

  const [allAccounts, allTrades, allSettings, allModels, allSnapshots] = await Promise.all([
    db.select().from(accounts).where(inArray(accounts.portfolioId, portfolioIds)),
    db.select().from(trades).where(inArray(trades.portfolioId, portfolioIds)),
    db.select().from(autoTradeSettings).where(inArray(autoTradeSettings.portfolioId, portfolioIds)),
    db.select().from(aiModels),
    db.select().from(portfolioSnapshots).where(inArray(portfolioSnapshots.portfolioId, portfolioIds)),
  ]);

  const openTrades = allTrades.filter(t => t.status === "open");
  const uniqueTickers = [...new Set(openTrades.map(t => t.ticker))];
  const quotes = await getQuotes(uniqueTickers);

  const cards = userPortfolios.map(p => {
    const pAccounts = allAccounts.filter(a => a.portfolioId === p.id);
    const pTrades   = allTrades.filter(t => t.portfolioId === p.id);
    const pSettings = allSettings.find(s => s.portfolioId === p.id);

    const cash      = pAccounts.reduce((s, a) => s + a.balance, 0);
    const open      = pTrades.filter(t => t.status === "open");
    const closed    = pTrades.filter(t => t.status === "closed");
    const costBasis = open.reduce((s, t) => s + t.entryPrice * t.quantity, 0);
    const invested  = open.reduce((s, t) => {
      const price = quotes.get(t.ticker)?.price ?? t.entryPrice;
      return s + price * t.quantity;
    }, 0);
    const unrealizedPnl = invested - costBasis;
    const realizedPnl = closed.reduce((s, t) => {
      if (t.exitPrice == null) return s;
      const diff = (t.exitPrice - t.entryPrice) * t.quantity;
      return s + (t.direction === "short" ? -diff : diff) - (t.fees ?? 0);
    }, 0);
    const wins = closed.filter(t => {
      if (t.exitPrice == null) return false;
      const diff = (t.exitPrice - t.entryPrice) * t.quantity;
      return (t.direction === "short" ? -diff : diff) > 0;
    }).length;

    let modelName: string | null = null;
    let modelStatus: string | null = null;
    if (pSettings?.model) {
      const match = allModels.find(m => m.provider === pSettings.model && m.status === "active")
        ?? allModels.find(m => m.provider === pSettings.model);
      modelName  = match?.name ?? (pSettings.model === "claude" ? "Claude" : "GPT-4o");
      modelStatus = match?.status ?? null;
    }

    const totalValue = cash + invested;
    return {
      id: p.id, name: p.name, mode: p.mode, broker: p.broker,
      isActive: p.id === activePortfolio?.id,
      cash, invested, totalValue,
      unrealizedPnl, realizedPnl,
      openTrades: open.length, closedTrades: closed.length, wins,
      modelName, modelStatus,
    };
  }).sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    return b.totalValue - a.totalValue;
  });

  // Upsert today's snapshot — fire-and-forget so a DB timeout can't crash the page
  const today = todayET();
  Promise.all(
    cards.map(card =>
      db.insert(portfolioSnapshots)
        .values({ portfolioId: card.id, date: today, totalValue: card.totalValue })
        .onConflictDoUpdate({
          target: [portfolioSnapshots.portfolioId, portfolioSnapshots.date],
          set: { totalValue: card.totalValue, updatedAt: new Date() },
        })
        .catch(() => { /* snapshot failure is non-fatal */ })
    )
  ).catch(() => {});

  // Return % helper: find the most recent snapshot on or before N days ago
  function returnPct(portfolioId: string, daysAgo: number, current: number): number | null {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysAgo);
    const cutoffStr = cutoff.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    const past = allSnapshots
      .filter(s => s.portfolioId === portfolioId && s.date <= cutoffStr)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    if (!past || past.totalValue === 0) return null;
    return ((current - past.totalValue) / past.totalValue) * 100;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Portfolio Comparison</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {cards.length} portfolio{cards.length !== 1 ? "s" : ""} · compare model performance over time
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(card => {
          const winRate   = card.closedTrades > 0 ? (card.wins / card.closedTrades) * 100 : null;
          const dayPct    = returnPct(card.id, 1, card.totalValue);
          const weekPct   = returnPct(card.id, 7, card.totalValue);
          const monthPct  = returnPct(card.id, 30, card.totalValue);
          const yearPct   = returnPct(card.id, 365, card.totalValue);

          return (
            <div key={card.id} className={`rounded-2xl border-2 p-5 space-y-4 ${card.isActive ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>

              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-black text-base">{card.name}</h2>
                    {card.isActive && <span className="text-xs text-primary font-semibold">Active</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${card.mode === "live" ? "bg-green-400/20 text-green-400" : "bg-yellow-400/20 text-yellow-400"}`}>
                      {card.mode === "live" ? "💰 Live" : "📄 Paper"}
                    </span>
                    <span className="text-xs text-muted-foreground">{card.broker}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-black">{fmt(card.totalValue)}</p>
                  <p className="text-xs text-muted-foreground">total value</p>
                </div>
              </div>

              {/* Model badge */}
              {card.modelName && (
                <div className={`rounded-xl px-3 py-2 text-xs flex items-center gap-2 ${card.modelStatus === "active" ? "bg-green-400/10 text-green-400" : "bg-yellow-400/10 text-yellow-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${card.modelStatus === "active" ? "bg-green-400" : "bg-yellow-400"}`} />
                  <span className="font-semibold">{card.modelName}</span>
                  {card.modelStatus && <span className="opacity-60 capitalize">· {card.modelStatus}</span>}
                </div>
              )}

              {/* Returns row */}
              <div className="grid grid-cols-4 gap-1 text-center">
                {([["Day", dayPct], ["Week", weekPct], ["Month", monthPct], ["Year", yearPct]] as [string, number | null][]).map(([label, pct]) => (
                  <div key={label} className="rounded-xl bg-muted/30 px-1 py-2">
                    <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                    <p className={`text-xs font-bold ${pct == null ? "text-muted-foreground" : pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {pct == null ? "—" : pctStr(pct)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Cash</p>
                  <p className="font-bold">{fmt(card.cash)}</p>
                </div>
                <div className="rounded-xl bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Mkt Value</p>
                  <p className="font-bold">{fmt(card.invested)}</p>
                  {Math.abs(card.unrealizedPnl) >= 0.01 && (
                    <p className={`text-xs font-semibold ${card.unrealizedPnl > 0 ? "text-green-400" : "text-red-400"}`}>
                      {card.unrealizedPnl >= 0 ? "+" : ""}{fmt(card.unrealizedPnl)} unrlzd
                    </p>
                  )}
                </div>
                <div className="rounded-xl bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Realized P&L</p>
                  <p className={`font-bold text-sm ${card.realizedPnl > 0 ? "text-green-400" : card.realizedPnl < 0 ? "text-red-400" : ""}`}>
                    {card.realizedPnl >= 0 ? "+" : ""}{fmt(card.realizedPnl)}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                  <p className={`font-bold ${winRate !== null && winRate >= 50 ? "text-green-400" : winRate !== null ? "text-red-400" : ""}`}>
                    {winRate !== null ? `${winRate.toFixed(0)}%` : "—"}
                    {card.closedTrades > 0 && <span className="text-xs font-normal opacity-70 ml-1">({card.wins}/{card.closedTrades})</span>}
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{card.openTrades} open · {card.closedTrades} closed</p>

              <PortfolioActions portfolioId={card.id} isActive={card.isActive} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
