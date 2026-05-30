"use client";

import { useEffect, useState, useCallback } from "react";
import type { DeployPick } from "@/app/api/deploy/route";

interface Account { id: string; name: string; type: "bank" | "brokerage"; balance: number; }
interface Transfer { id: string; fromAccountId: string; toAccountId: string; amount: number; note: string | null; createdAt: string; }
interface Trade {
  id: string; ticker: string; direction: "long" | "short"; quantity: number;
  entryPrice: number; status: string;
}
interface Position extends Trade {
  currentPrice: number; totalValue: number; pnl: number; pnlPct: number;
}

const BANK_ID      = "00000000-0000-0000-0000-000000000001";
const BROKERAGE_ID = "00000000-0000-0000-0000-000000000002";

function fmt(n: number, showSign = false) {
  const s = Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (showSign) return (n >= 0 ? "+" : "−") + s;
  return (n < 0 ? "−" : "") + s;
}
function pct(n: number) {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

export default function AccountsPage() {
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading]     = useState(true);
  const [posLoading, setPosLoading] = useState(false);

  const [amount, setAmount]   = useState("");
  const [note, setNote]       = useState("");
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [ok, setOk]           = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // Deploy Capital flow
  type DeployState = "idle" | "scanning" | "preview" | "executing" | "done";
  const [deployState, setDeployState] = useState<DeployState>("idle");
  const [deployModel, setDeployModel] = useState<"openai" | "claude">("openai");
  const [deployPreview, setDeployPreview] = useState<{
    balance: number; totalInvest: number; picks: DeployPick[]; summary: string;
  } | null>(null);
  const [deployResult, setDeployResult] = useState<{ opened: string[]; errors: string[] } | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

  async function runDeployPreview() {
    setDeployState("scanning");
    setDeployError(null);
    setDeployPreview(null);
    setDeployResult(null);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", model: deployModel }),
      });
      const data = await res.json();
      if (!res.ok) { setDeployError(data.error); setDeployState("idle"); return; }
      setDeployPreview(data);
      setDeployState("preview");
    } catch { setDeployError("Network error"); setDeployState("idle"); }
  }

  async function executeDeployment() {
    if (!deployPreview) return;
    setDeployState("executing");
    const res = await fetch("/api/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "execute", picks: deployPreview.picks }),
    });
    const data = await res.json();
    setDeployResult({ opened: data.opened ?? [], errors: data.errors ?? [] });
    setDeployState("done");
    await load();
    await loadPositions();
  }

  async function resetAll() {
    if (!confirm("Reset all paper trading data?\n\nThis clears all trades, history, and sets balances to $0.\nNo real money is affected.")) return;
    setResetting(true);
    await fetch("/api/accounts/reset", { method: "POST" });
    setPositions([]);
    await load();
    setResetting(false);
  }

  const load = useCallback(async () => {
    const res  = await fetch("/api/accounts");
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setTransfers(data.transfers ?? []);
    setLoading(false);
  }, []);

  const loadPositions = useCallback(async () => {
    setPosLoading(true);
    try {
      const res    = await fetch("/api/trades");
      const trades: Trade[] = await res.json();
      const open   = trades.filter((t) => t.status === "open");

      const unique = [...new Set(open.map((t) => t.ticker))];
      const priceMap: Record<string, number> = {};
      await Promise.all(
        unique.map((ticker) =>
          fetch(`/api/market?ticker=${ticker}`)
            .then((r) => r.json())
            .then((d) => { if (d.price) priceMap[ticker] = d.price; })
            .catch(() => {})
        )
      );

      const pos: Position[] = open.map((t) => {
        const curr = priceMap[t.ticker] ?? t.entryPrice;
        const totalValue = curr * t.quantity;
        const pnl = (curr - t.entryPrice) * t.quantity * (t.direction === "short" ? -1 : 1);
        const pnlPct = ((curr - t.entryPrice) / t.entryPrice) * 100 * (t.direction === "short" ? -1 : 1);
        return { ...t, currentPrice: curr, totalValue, pnl, pnlPct };
      });
      setPositions(pos);
    } finally {
      setPosLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadPositions(); }, [load, loadPositions]);

  const bank      = accounts.find((a) => a.type === "bank");
  const brokerage = accounts.find((a) => a.type === "brokerage");
  // Cost basis = what you actually paid — never inflates from quote discrepancies
  const costBasis  = positions.reduce((s, p) => s + p.entryPrice * p.quantity, 0);
  // Market value = current price × shares — used for per-position P&L display
  const marketValue = positions.reduce((s, p) => s + p.totalValue, 0);
  const totalPnl  = positions.reduce((s, p) => s + p.pnl, 0);
  // Total = cash + cost basis; this always equals exactly what you deposited
  const totalValue = (bank?.balance ?? 0) + (brokerage?.balance ?? 0) + costBasis;

  async function act(action: string, extra?: object) {
    setBusy(true); setErr(null); setOk(null);
    const res  = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, amount: parseFloat(amount), note: note || undefined, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error); } else { setOk("Done!"); setAmount(""); setNote(""); await load(); }
    setBusy(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Portfolio value ── */}
      <div className="pt-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Total Invested</p>
        <p className="text-4xl font-black">{loading ? "—" : fmt(totalValue)}</p>
        {positions.length > 0 && Math.abs(totalPnl) >= 0.01 && (
          <p className={`text-sm font-semibold mt-1 ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {fmt(totalPnl, true)} unrealized · market value {fmt((bank?.balance ?? 0) + (brokerage?.balance ?? 0) + marketValue)}
          </p>
        )}
        {positions.length > 0 && Math.abs(totalPnl) < 0.01 && (
          <p className="text-xs text-muted-foreground mt-1">{positions.length} open position{positions.length !== 1 ? "s" : ""}</p>
        )}
      </div>

      {/* ── Positions ── */}
      {positions.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-3">
            Positions {posLoading && <span className="animate-pulse">·</span>}
          </p>
          <div className="space-y-2">
            {positions.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-base">{p.ticker}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${p.direction === "long" ? "bg-green-400/20 text-green-400" : "bg-red-400/20 text-red-400"}`}>
                      {p.direction.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares · avg {fmt(p.entryPrice)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{fmt(p.totalValue)}</p>
                  <p className={`text-xs font-semibold ${p.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {fmt(p.pnl, true)} ({pct(p.pnlPct)})
                  </p>
                  <p className="text-xs text-muted-foreground">${p.currentPrice.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cash ── */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-3">Cash</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">🏦 Bank</p>
            <p className="text-xl font-black">{fmt(bank?.balance ?? 0)}</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">📈 Brokerage</p>
            <p className="text-xl font-black">{fmt(brokerage?.balance ?? 0)}</p>
            {costBasis > 0 && <p className="text-xs text-muted-foreground mt-0.5">+{fmt(costBasis)} in positions</p>}
          </div>
        </div>
      </div>

      {/* ── Deploy Capital ── */}
      {(brokerage?.balance ?? 0) >= 1 && positions.length === 0 && deployState === "idle" && (
        <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 space-y-3">
          <div>
            <p className="font-black text-lg">🚀 Deploy Capital</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              AI will scan the market and invest your <span className="text-foreground font-semibold">{fmt(brokerage?.balance ?? 0)}</span> brokerage balance across the best picks it finds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">AI model:</span>
            {(["openai", "claude"] as const).map((m) => (
              <button key={m} onClick={() => setDeployModel(m)}
                className={`text-xs px-3 py-1 rounded-lg border transition-colors ${deployModel === m ? "border-primary bg-primary/15 text-primary font-semibold" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
                {m === "openai" ? "GPT-4o" : "Claude"}
              </button>
            ))}
          </div>
          <button onClick={runDeployPreview}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-black text-base hover:opacity-90 transition-opacity">
            Scan &amp; Preview →
          </button>
        </div>
      )}

      {deployState === "scanning" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-2 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground animate-pulse">🤖 AI is scanning the market…</p>
          <p>Pulling stock data across 4 screeners…</p>
          <p>Finding diamonds in the rough…</p>
          <p className="text-xs">Usually takes 15–30 seconds.</p>
        </div>
      )}

      {deployState === "preview" && deployPreview && (
        <div className="rounded-2xl border-2 border-primary/40 bg-card p-5 space-y-4">
          <div>
            <p className="font-black text-lg">📋 Deployment Plan</p>
            <p className="text-sm text-muted-foreground mt-0.5">{deployPreview.summary}</p>
          </div>
          <p className="text-sm">
            Investing <span className="font-black text-primary">{fmt(deployPreview.totalInvest)}</span> across <span className="font-black">{deployPreview.picks.length} stocks</span> — <span className="text-muted-foreground">{fmt(deployPreview.balance - deployPreview.totalInvest)} stays in brokerage</span>
          </p>
          <div className="space-y-2">
            {deployPreview.picks.map((p) => (
              <div key={p.symbol} className="flex items-center justify-between py-2 border-b border-border text-sm">
                <div>
                  <span className="font-black text-primary">{p.symbol}</span>
                  <span className="text-xs text-muted-foreground ml-2">{p.name}</span>
                  <span className={`text-xs ml-2 px-1.5 py-0.5 rounded font-semibold ${
                    p.riskLevel === "conservative" ? "bg-green-400/20 text-green-400" :
                    p.riskLevel === "aggressive"   ? "bg-red-400/20 text-red-400" :
                    "bg-yellow-400/20 text-yellow-400"}`}>
                    {p.riskLevel}
                  </span>
                </div>
                <div className="text-right">
                  <p className="font-bold">{fmt(p.invest)}</p>
                  <p className="text-xs text-muted-foreground">{p.shares.toFixed(4)} shares @ ${p.entryPrice.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDeployState("idle")}
              className="rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button onClick={executeDeployment}
              className="rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-black hover:opacity-90 transition-opacity">
              Confirm &amp; Buy All
            </button>
          </div>
        </div>
      )}

      {deployState === "executing" && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold animate-pulse">⚡ Opening trades…</p>
        </div>
      )}

      {deployState === "done" && deployResult && (
        <div className="rounded-2xl border border-green-400/30 bg-green-400/5 p-5 space-y-2">
          <p className="font-black text-green-400">✓ Capital Deployed!</p>
          {deployResult.opened.length > 0 && (
            <p className="text-sm">Opened: <span className="font-semibold">{deployResult.opened.join(", ")}</span></p>
          )}
          {deployResult.errors.length > 0 && deployResult.errors.map((e, i) => (
            <p key={i} className="text-xs text-red-400">{e}</p>
          ))}
          <button onClick={() => { setDeployState("idle"); setDeployPreview(null); setDeployResult(null); }}
            className="text-xs text-muted-foreground underline">Done</button>
        </div>
      )}

      {deployError && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{deployError}</p>
          <button onClick={() => setDeployError(null)} className="text-xs underline mt-1">Dismiss</button>
        </div>
      )}

      {/* ── Move money ── always visible ── */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Move Money</p>
        <div className="flex gap-3">
          <input type="number" min="0.01" step="0.01" placeholder="Amount ($)" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <input type="text" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)}
            className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => act("deposit")} disabled={busy || !amount}
            className="rounded-xl bg-primary text-primary-foreground py-2.5 text-xs font-bold hover:opacity-90 disabled:opacity-40 transition-opacity">
            + Deposit to Bank
          </button>
          <button onClick={() => act("transfer", { direction: "to_brokerage" })} disabled={busy || !amount}
            className="rounded-xl border border-border py-2.5 text-xs font-semibold hover:bg-accent disabled:opacity-40 transition-colors">
            Bank → Brokerage
          </button>
          <button onClick={() => act("transfer", { direction: "to_bank" })} disabled={busy || !amount}
            className="rounded-xl border border-border py-2.5 text-xs font-semibold hover:bg-accent disabled:opacity-40 transition-colors">
            Brokerage → Bank
          </button>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        {ok  && <p className="text-xs text-green-400">{ok}</p>}
      </div>

      {/* ── Transaction history ── */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-3">
          History
        </p>
        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="space-y-0 divide-y divide-border rounded-2xl border border-border overflow-hidden">
            {transfers.map((t) => {
              const isDeposit  = t.fromAccountId === t.toAccountId && t.fromAccountId === BANK_ID;
              const isReturn   = t.note?.includes("closed");
              const amtColor   = (isDeposit || isReturn) ? "text-green-400" : "text-foreground";
              const sign       = (isDeposit || isReturn) ? "+" : "−";
              return (
                <div key={t.id} className="flex items-start justify-between px-4 py-3 hover:bg-accent/30 transition-colors">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-medium truncate">{t.note ?? "Transfer"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(t.createdAt).toLocaleDateString()} {new Date(t.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <p className={`text-sm font-bold shrink-0 ${amtColor}`}>
                    {sign}{Math.abs(t.amount).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Paper trading reset ── */}
      <div className="pt-4 border-t border-border">
        <button
          onClick={resetAll}
          disabled={resetting}
          className="text-xs text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "🗑 Reset paper trading data"}
        </button>
        <p className="text-xs text-muted-foreground mt-1 opacity-60">
          Clears all trades, history, and balances. Paper trading only — no real money affected.
        </p>
      </div>

    </div>
  );
}
