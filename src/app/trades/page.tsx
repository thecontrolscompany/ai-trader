import { db } from "@/db";
import { trades } from "@/db/schema";
import { calcRealizedPnl, formatPnl, pnlColor } from "@/lib/pnl";
import type { Trade } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { desc } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const rows = (await db
    .select()
    .from(trades)
    .orderBy(desc(trades.openedAt))) as Trade[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Trades</h1>
          <p className="text-muted-foreground text-sm mt-1">{rows.length} total</p>
        </div>
        <Link
          href="/trades/new"
          className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Trade
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">
          No trades yet.{" "}
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
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-left">Dir</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Entry</th>
                <th className="px-4 py-3 text-right">Exit</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">P&L</th>
                <th className="px-4 py-3 text-left">Opened</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((t) => {
                const pnl = calcRealizedPnl(t);
                return (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold">
                      <Link href={`/trades/${t.id}`} className="hover:underline">
                        {t.ticker}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{t.assetClass}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={t.direction === "long" ? "default" : "destructive"}
                        className="capitalize text-xs"
                      >
                        {t.direction}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`capitalize text-xs font-medium ${
                          t.status === "open"
                            ? "text-blue-600"
                            : t.status === "closed"
                            ? "text-muted-foreground"
                            : "text-orange-500"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">${t.entryPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      {t.exitPrice != null ? `$${t.exitPrice.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{t.quantity}</td>
                    <td className={`px-4 py-3 text-right font-medium ${pnl != null ? pnlColor(pnl) : ""}`}>
                      {pnl != null ? formatPnl(pnl) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(t.openedAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
