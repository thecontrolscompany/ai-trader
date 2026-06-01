import { db } from "@/db";
import { aiSignals, autoTradeLog, trades } from "@/db/schema";
import { getActivePortfolio } from "@/lib/portfolio";
import { desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function fmt(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function ActivityPage() {
  const portfolio = await getActivePortfolio();
  if (!portfolio) redirect("/login");

  const [allTrades, log, scans] = await Promise.all([
    db.select().from(trades).where(eq(trades.portfolioId, portfolio.id)).orderBy(desc(trades.openedAt)).limit(200),
    db.select().from(autoTradeLog).where(eq(autoTradeLog.portfolioId, portfolio.id)).orderBy(desc(autoTradeLog.createdAt)).limit(100),
    db.select().from(aiSignals).orderBy(desc(aiSignals.createdAt)).limit(100),
  ]);

  const ACTION_COLOR: Record<string, string> = {
    opened: "text-green-400", closed: "text-blue-400",
    skipped: "text-muted-foreground", error: "text-red-400",
  };

  return (
    <div className="space-y-10 max-w-5xl">
      <div>
        <h1 className="text-xl font-black tracking-tight">Activity Log</h1>
        <p className="text-muted-foreground text-xs mt-1">
          Research data for <span className="text-foreground font-semibold">{portfolio.name}</span> — not day-to-day operational
        </p>
      </div>

      {/* Auto-trade log */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Auto-Trade Activity</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No auto-trade activity yet. Enable Auto Trade and it will log every action here.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {log.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/20">
                <span className={`text-xs font-bold uppercase w-14 shrink-0 mt-0.5 ${ACTION_COLOR[e.action] ?? "text-muted-foreground"}`}>{e.action}</span>
                <div className="flex-1 min-w-0">
                  {e.ticker && <span className="font-bold text-sm mr-2">{e.ticker}</span>}
                  <span className="text-xs text-muted-foreground">{e.reason}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{fmt(e.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Full trade history */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Trade History <span className="font-normal normal-case">({allTrades.length})</span>
        </h2>
        {allTrades.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trades recorded yet.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Ticker","Dir","Status","Entry","Exit","Qty","Opened","Closed","Notes"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-muted-foreground font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allTrades.map((t) => {
                  const pnl = t.exitPrice != null ? (t.exitPrice - t.entryPrice) * t.quantity * (t.direction === "short" ? -1 : 1) : null;
                  return (
                    <tr key={t.id} className="hover:bg-accent/20">
                      <td className="px-3 py-2 font-bold text-primary">{t.ticker}</td>
                      <td className={`px-3 py-2 capitalize font-medium ${t.direction === "long" ? "text-green-400" : "text-red-400"}`}>{t.direction}</td>
                      <td className={`px-3 py-2 capitalize ${t.status === "open" ? "text-blue-400" : "text-muted-foreground"}`}>{t.status}</td>
                      <td className="px-3 py-2">${t.entryPrice.toFixed(2)}</td>
                      <td className="px-3 py-2">{t.exitPrice != null ? `$${t.exitPrice.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2">{t.quantity.toFixed(4)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmt(t.openedAt)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmt(t.closedAt)}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate" title={t.notes ?? ""}>{t.notes?.replace("[AUTO] ", "").replace("[DEPLOY] ", "").slice(0, 40) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* AI scan signals */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          AI Scan Signals <span className="font-normal normal-case">(all portfolios · {scans.length} most recent)</span>
        </h2>
        <p className="text-xs text-muted-foreground mb-3">Every stock the AI considered, whether it was traded or not.</p>
        {scans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scan signals yet. Run an AI Scan to populate this.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Ticker","Model","Dir","Confidence","Entry Zone","Target","Stop","Scanned"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-muted-foreground font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scans.map((s) => (
                  <tr key={s.id} className="hover:bg-accent/20">
                    <td className="px-3 py-2 font-bold text-primary">{s.ticker}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.model}</td>
                    <td className={`px-3 py-2 capitalize font-medium ${s.direction === "long" ? "text-green-400" : s.direction === "short" ? "text-red-400" : "text-muted-foreground"}`}>{s.direction}</td>
                    <td className="px-3 py-2">{(s.confidence * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2">${s.entryZoneLow.toFixed(2)}–${s.entryZoneHigh.toFixed(2)}</td>
                    <td className="px-3 py-2 text-green-400">${s.targetPrice.toFixed(2)}</td>
                    <td className="px-3 py-2 text-red-400">${s.stopLoss.toFixed(2)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmt(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
