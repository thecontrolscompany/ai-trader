"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DeployPick } from "@/app/api/deploy/route";

interface Account { id: string; type: string; balance: number; }
interface Trade { id: string; ticker: string; direction: string; quantity: number; entryPrice: number; status: string; }
interface Position extends Trade { currentPrice: number; totalValue: number; pnl: number; pnlPct: number; }

function fmt(n: number) { return n.toLocaleString("en-US", { style: "currency", currency: "USD" }); }

export default function EasyHomePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  // Deploy flow
  type DeployState = "idle" | "scanning" | "preview" | "executing" | "done";
  const [deployState, setDeployState] = useState<DeployState>("idle");
  const [deployPreview, setDeployPreview] = useState<{ balance: number; totalInvest: number; picks: DeployPick[]; summary: string } | null>(null);
  const [deployResult, setDeployResult] = useState<{ opened: string[] } | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

  async function loadData() {
    const [acctRes, tradeRes] = await Promise.all([fetch("/api/accounts"), fetch("/api/trades")]);
    const acctData = await acctRes.json();
    const tradeData: Trade[] = await tradeRes.json();
    setAccounts(acctData.accounts ?? []);

    const open = tradeData.filter(t => t.status === "open");
    const priceMap: Record<string, number> = {};
    await Promise.all([...new Set(open.map(t => t.ticker))].map(async (ticker) => {
      const r = await fetch(`/api/market?ticker=${ticker}`);
      const d = await r.json();
      if (d.price) priceMap[ticker] = d.price;
    }));
    setPositions(open.map(t => {
      const curr = priceMap[t.ticker] ?? t.entryPrice;
      const pnl = (curr - t.entryPrice) * t.quantity * (t.direction === "short" ? -1 : 1);
      return { ...t, currentPrice: curr, totalValue: curr * t.quantity, pnl, pnlPct: pnl / (t.entryPrice * t.quantity) * 100 };
    }));
    setLoading(false);
  }
  useEffect(() => { loadData(); }, []);

  const brokerage = accounts.find(a => a.type === "brokerage");
  const bank = accounts.find(a => a.type === "bank");
  const costBasis = positions.reduce((s, p) => s + p.entryPrice * p.quantity, 0);
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
  const totalValue = (bank?.balance ?? 0) + (brokerage?.balance ?? 0) + costBasis;

  async function runDeploy() {
    setDeployState("scanning"); setDeployError(null); setDeployPreview(null); setDeployResult(null);
    const res = await fetch("/api/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", model: "openai" }) });
    const data = await res.json();
    if (!res.ok) { setDeployError(data.error); setDeployState("idle"); return; }
    setDeployPreview(data); setDeployState("preview");
  }

  async function confirmDeploy() {
    if (!deployPreview) return;
    setDeployState("executing");
    const res = await fetch("/api/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "execute", picks: deployPreview.picks }) });
    const data = await res.json();
    setDeployResult({ opened: data.opened ?? [] });
    setDeployState("done");
    await loadData();
  }

  return (
    <div className="space-y-8 max-w-md mx-auto">
      {/* Portfolio value */}
      <div className="text-center pt-4">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Portfolio Value</p>
        <p className="text-5xl font-black">{loading ? "—" : fmt(totalValue)}</p>
        {Math.abs(totalPnl) >= 0.01 && (
          <p className={`text-base font-semibold mt-1 ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)} unrealized
          </p>
        )}
      </div>

      {/* Cash summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card border border-border p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">🏦 Bank</p>
          <p className="text-lg font-black">{fmt(bank?.balance ?? 0)}</p>
        </div>
        <div className="rounded-2xl bg-card border border-border p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">📈 Brokerage</p>
          <p className="text-lg font-black">{fmt(brokerage?.balance ?? 0)}</p>
          {costBasis > 0 && <p className="text-xs text-muted-foreground mt-0.5">+{fmt(costBasis)} invested</p>}
        </div>
      </div>

      {/* Positions */}
      {positions.length > 0 && (
        <div className="space-y-2">
          {positions.map(p => (
            <div key={p.id} className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black">{p.ticker}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${p.direction === "long" ? "bg-green-400/20 text-green-400" : "bg-red-400/20 text-red-400"}`}>{p.direction.toUpperCase()}</span>
                </div>
                <p className="text-xs text-muted-foreground">{p.quantity.toFixed(4)} shares · avg {fmt(p.entryPrice)}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">{fmt(p.totalValue)}</p>
                <p className={`text-xs font-semibold ${p.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{p.pnl >= 0 ? "+" : ""}{fmt(p.pnl)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deploy Capital */}
      {(brokerage?.balance ?? 0) >= 1 && deployState === "idle" && (
        <button onClick={runDeploy}
          className="w-full rounded-2xl bg-primary text-primary-foreground py-5 text-lg font-black hover:opacity-90 transition-opacity">
          🚀 Let AI Invest My Cash
        </button>
      )}

      {deployState === "scanning" && (
        <div className="rounded-2xl bg-card border border-border p-6 text-center space-y-2">
          <p className="text-base font-semibold animate-pulse">AI is scanning the market…</p>
          <p className="text-sm text-muted-foreground">Finding the best opportunities for you.</p>
          <p className="text-xs text-muted-foreground">Usually 15–30 seconds.</p>
        </div>
      )}

      {deployState === "preview" && deployPreview && (
        <div className="rounded-2xl border-2 border-primary/40 bg-card p-5 space-y-4">
          <p className="font-black text-lg">Ready to invest {fmt(deployPreview.totalInvest)}</p>
          <p className="text-sm text-muted-foreground">{deployPreview.summary}</p>
          <div className="space-y-2">
            {deployPreview.picks.map(p => (
              <div key={p.symbol} className="flex justify-between text-sm py-1 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="font-black text-primary">{p.symbol}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${p.riskLevel === "conservative" ? "bg-green-400/20 text-green-400" : p.riskLevel === "aggressive" ? "bg-red-400/20 text-red-400" : "bg-yellow-400/20 text-yellow-400"}`}>{p.riskLevel}</span>
                </div>
                <span className="font-bold">{fmt(p.invest)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDeployState("idle")} className="rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={confirmDeploy} className="rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-black hover:opacity-90">Confirm &amp; Invest</button>
          </div>
        </div>
      )}

      {deployState === "executing" && <div className="text-center text-sm animate-pulse">Opening positions…</div>}

      {deployState === "done" && deployResult && (
        <div className="rounded-2xl border border-green-400/30 bg-green-400/5 p-5 text-center space-y-2">
          <p className="font-black text-green-400 text-lg">✓ Invested!</p>
          <p className="text-sm">{deployResult.opened.join(", ")}</p>
          <button onClick={() => { setDeployState("idle"); setDeployPreview(null); setDeployResult(null); }} className="text-xs text-muted-foreground underline">Done</button>
        </div>
      )}

      {deployError && <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{deployError}</div>}

      {/* Quick links */}
      <div className="flex gap-3 justify-center">
        <Link href="/trades" className="text-sm text-muted-foreground hover:text-foreground underline">View Trades</Link>
        <Link href="/accounts" className="text-sm text-muted-foreground hover:text-foreground underline">Manage Funds</Link>
      </div>
    </div>
  );
}
