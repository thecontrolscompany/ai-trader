import { db } from "@/db";
import { accounts, autoTradeSettings, aiModels, trades } from "@/db/schema";
import { getActivePortfolio } from "@/lib/portfolio";
import { auth } from "@/auth";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface PortfolioCard {
  id: string;
  name: string;
  mode: string;
  broker: string;
  cash: number;
  invested: number;
  realizedPnl: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  modelName: string | null;
  modelStatus: string | null;
  isActive: boolean;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function pct(n: number) {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

export default async function PortfoliosPage() {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) redirect("/login");

  const activePortfolio = await getActivePortfolio();

  // Fetch all portfolios for this user
  const { portfolios } = await import("@/db/schema");
  const userPortfolios = await db.select().from(portfolios)
    .where(eq(portfolios.userId, userId));

  if (userPortfolios.length === 0) redirect("/accounts");

  const portfolioIds = userPortfolios.map(p => p.id);

  // Batch fetch all accounts, trades, and settings for all portfolios
  const [allAccounts, allTrades, allSettings, allModels] = await Promise.all([
    db.select().from(accounts).where(inArray(accounts.portfolioId, portfolioIds)),
    db.select().from(trades).where(inArray(trades.portfolioId, portfolioIds)),
    db.select().from(autoTradeSettings).where(inArray(autoTradeSettings.portfolioId, portfolioIds)),
    db.select().from(aiModels),
  ]);

  const modelMap = Object.fromEntries(allModels.map(m => [m.id, m]));

  const cards: PortfolioCard[] = userPortfolios.map(p => {
    const pAccounts = allAccounts.filter(a => a.portfolioId === p.id);
    const pTrades   = allTrades.filter(t => t.portfolioId === p.id);
    const pSettings = allSettings.find(s => s.portfolioId === p.id);

    const cash = pAccounts.reduce((sum, a) => sum + a.balance, 0);

    const open   = pTrades.filter(t => t.status === "open");
    const closed = pTrades.filter(t => t.status === "closed");
    const invested = open.reduce((sum, t) => sum + t.entryPrice * t.quantity, 0);

    const realizedPnl = closed.reduce((sum, t) => {
      if (t.exitPrice == null) return sum;
      const diff = (t.exitPrice - t.entryPrice) * t.quantity;
      return sum + (t.direction === "short" ? -diff : diff) - (t.fees ?? 0);
    }, 0);

    const wins = closed.filter(t => {
      if (t.exitPrice == null) return false;
      const diff = (t.exitPrice - t.entryPrice) * t.quantity;
      const pnl = t.direction === "short" ? -diff : diff;
      return pnl > 0;
    }).length;

    // Resolve model name from auto_trade_settings or most recent trade notes
    let modelName: string | null = null;
    let modelStatus: string | null = null;
    if (pSettings?.model) {
      // Try to match by provider to active/testing model
      const match = allModels.find(m => m.provider === pSettings.model && m.status === "active")
        ?? allModels.find(m => m.provider === pSettings.model);
      if (match) { modelName = match.name; modelStatus = match.status; }
      else { modelName = pSettings.model === "claude" ? "Claude" : "GPT-4o"; }
    }
    // Infer from trade notes if no settings
    if (!modelName && pTrades.length > 0) {
      const lastNote = [...pTrades].sort((a, b) =>
        new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
      )[0]?.notes ?? "";
      if (lastNote.includes("[AUTO]") || lastNote.includes("[DEPLOY]")) {
        modelName = "AI (unknown)";
      }
    }

    return {
      id: p.id, name: p.name, mode: p.mode, broker: p.broker,
      cash, invested,
      realizedPnl, openTrades: open.length, closedTrades: closed.length, wins,
      modelName, modelStatus,
      isActive: p.id === activePortfolio?.id,
    };
  });

  // Sort: active first, then by total value desc
  cards.sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    return (b.cash + b.invested) - (a.cash + a.invested);
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Portfolio Comparison</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All {cards.length} portfolios at a glance — compare model performance over time.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(card => {
          const totalValue = card.cash + card.invested;
          const winRate = card.closedTrades > 0 ? (card.wins / card.closedTrades) * 100 : null;
          const returnPct = card.invested + card.cash > 0
            ? (card.realizedPnl / (card.invested + card.cash)) * 100
            : null;

          return (
            <div key={card.id} className={`rounded-2xl border-2 p-5 space-y-4 ${card.isActive ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-black text-base leading-tight">{card.name}</h2>
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
                  <p className="text-xl font-black">{fmt(totalValue)}</p>
                  <p className="text-xs text-muted-foreground">total value</p>
                </div>
              </div>

              {/* Model badge */}
              {card.modelName && (
                <div className={`rounded-xl px-3 py-2 text-xs flex items-center gap-2 ${card.modelStatus === "active" ? "bg-green-400/10 text-green-400" : card.modelStatus === "testing" ? "bg-yellow-400/10 text-yellow-400" : "bg-muted/40 text-muted-foreground"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${card.modelStatus === "active" ? "bg-green-400" : card.modelStatus === "testing" ? "bg-yellow-400" : "bg-muted-foreground"}`} />
                  <span className="font-semibold">{card.modelName}</span>
                  {card.modelStatus && <span className="opacity-60 capitalize">· {card.modelStatus}</span>}
                </div>
              )}

              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Cash</p>
                  <p className="font-bold">{fmt(card.cash)}</p>
                </div>
                <div className="rounded-xl bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Invested</p>
                  <p className="font-bold">{fmt(card.invested)}</p>
                </div>
                <div className="rounded-xl bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Realized P&L</p>
                  <p className={`font-bold ${card.realizedPnl > 0 ? "text-green-400" : card.realizedPnl < 0 ? "text-red-400" : ""}`}>
                    {card.realizedPnl >= 0 ? "+" : ""}{fmt(card.realizedPnl)}
                    {returnPct !== null && <span className="text-xs font-normal opacity-70 ml-1">({pct(returnPct)})</span>}
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

              {/* Trade counts */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{card.openTrades} open · {card.closedTrades} closed</span>
                {card.openTrades === 0 && card.closedTrades === 0 && (
                  <span className="text-muted-foreground">No trades yet</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Link href="/accounts"
                  onClick={async () => {
                    if (!card.isActive) {
                      await fetch("/api/portfolios/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portfolioId: card.id }) });
                    }
                  }}
                  className="flex-1 text-center rounded-xl border border-border py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
                  View Portfolio
                </Link>
                {!card.isActive && (
                  <SwitchButton portfolioId={card.id} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Small client component just for the switch action
function SwitchButton({ portfolioId }: { portfolioId: string }) {
  return (
    <form action={async () => {
      "use server";
      // Server action to switch portfolio
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieStore.set("portfolio_id", portfolioId, { path: "/", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
    }}>
      <button type="submit"
        className="rounded-xl bg-primary text-primary-foreground px-3 py-2 text-xs font-bold hover:opacity-90 transition-opacity whitespace-nowrap">
        Switch
      </button>
    </form>
  );
}
