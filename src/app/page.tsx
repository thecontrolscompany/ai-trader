import { db } from "@/db";
import { trades } from "@/db/schema";
import { calcRealizedPnl } from "@/lib/pnl";
import type { Trade } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export const dynamic = "force-dynamic";

function buildSummary(rows: Trade[]) {
  const open = rows.filter((t) => t.status === "open");
  const closed = rows.filter((t) => t.status === "closed");
  const wins = closed.filter((t) => {
    const pnl = calcRealizedPnl(t);
    return pnl != null && pnl > 0;
  });
  const realizedPnl = closed.reduce((sum, t) => sum + (calcRealizedPnl(t) ?? 0), 0);
  return {
    total: rows.length,
    open: open.length,
    closed: closed.length,
    winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : null,
    realizedPnl,
  };
}

export default async function DashboardPage() {
  const rows = (await db.select().from(trades)) as Trade[];
  const s = buildSummary(rows);
  const openTrades = rows.filter((t) => t.status === "open").slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Hypothetical portfolio — no real capital at risk
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Total Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{s.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Open
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{s.open}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {s.winRate != null ? `${s.winRate.toFixed(0)}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Realized P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${
                s.realizedPnl > 0
                  ? "text-green-400"
                  : s.realizedPnl < 0
                  ? "text-red-400"
                  : ""
              }`}
            >
              {s.realizedPnl >= 0 ? "+" : ""}${s.realizedPnl.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Open Positions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Open Positions</h2>
          <Link href="/trades" className="text-sm text-muted-foreground hover:text-foreground">
            View all →
          </Link>
        </div>
        {openTrades.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">
            No open trades.{" "}
            <Link href="/trades/new" className="underline">
              Enter your first trade
            </Link>
            .
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Ticker</th>
                  <th className="px-4 py-3 text-left">Direction</th>
                  <th className="px-4 py-3 text-right">Entry</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Target</th>
                  <th className="px-4 py-3 text-right">Stop</th>
                  <th className="px-4 py-3 text-left">Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {openTrades.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold">
                      <Link href={`/trades/${t.id}`}>{t.ticker}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={t.direction === "long" ? "default" : "destructive"}
                        className="capitalize"
                      >
                        {t.direction}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">${t.entryPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">{t.quantity}</td>
                    <td className="px-4 py-3 text-right text-green-400">
                      {t.takeProfit != null ? `$${t.takeProfit.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-red-400">
                      {t.stopLoss != null ? `$${t.stopLoss.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(t.openedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
