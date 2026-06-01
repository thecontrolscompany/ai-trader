"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RiskLevel, ScanModel, ScanResult } from "@/app/api/scan/route";

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; desc: string }> = {
  conservative: { label: "Conservative", color: "text-green-400",  bg: "bg-green-400/10 border-green-400/30",  desc: "Small stop loss, strong reward ratio, stable company" },
  moderate:     { label: "Moderate",     color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30", desc: "Balanced risk and reward" },
  aggressive:   { label: "Aggressive",   color: "text-red-400",    bg: "bg-red-400/10 border-red-400/30",      desc: "Higher potential gain, higher potential loss" },
};

interface DBModel { id: string; name: string; provider: string; status: string; paperOnly: string; notes: string | null; }

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? "bg-green-400" : pct >= 55 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold w-8 text-right">{pct}%</span>
    </div>
  );
}

interface TradeForm {
  dollars: string;
  shares: string;
}

function OpenTradePanel({
  pick,
  brokerageBalance,
  onAdded,
}: {
  pick: ScanResult["picks"][number];
  brokerageBalance: number;
  onAdded: () => void;
}) {
  const [form, setForm] = useState<TradeForm>({ dollars: "", shares: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const price = pick.entryZoneLow;

  function setDollars(val: string) {
    const d = parseFloat(val);
    setForm({ dollars: val, shares: isNaN(d) ? "" : (d / price).toFixed(4) });
  }
  function setShares(val: string) {
    const s = parseFloat(val);
    setForm({ shares: val, dollars: isNaN(s) ? "" : (s * price).toFixed(2) });
  }

  const shares = parseFloat(form.shares);
  const cost = isNaN(shares) ? 0 : shares * price;
  const canAfford = cost <= brokerageBalance && cost > 0;

  async function submit() {
    if (!canAfford) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: pick.symbol,
          direction: pick.direction === "short" ? "short" : "long",
          entryPrice: price,
          quantity: shares,
          stopLoss: pick.stopLoss,
          takeProfit: pick.targetPrice,
          notes: pick.reasoning,
          aiSignalId: pick.signalId ?? null,
        }),
      });
    const data = await res.json();
    if (!res.ok) { setErr(data.error); setBusy(false); return; }
    onAdded();
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wide">Open Trade</span>
        <span>Brokerage available: <span className="text-foreground font-semibold">${brokerageBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Dollar amount ($)</label>
          <input
            type="number" min="0" step="1" placeholder="e.g. 500"
            value={form.dollars}
            onChange={(e) => setDollars(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Shares</label>
          <input
            type="number" min="0" step="0.0001" placeholder="e.g. 3.5"
            value={form.shares}
            onChange={(e) => setShares(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {cost > 0 && (
        <p className={`text-xs ${canAfford ? "text-muted-foreground" : "text-red-400"}`}>
          {canAfford
            ? `Cost: $${cost.toFixed(2)} · Entry @ $${price.toFixed(2)} · Target $${pick.targetPrice.toFixed(2)} · Stop $${pick.stopLoss.toFixed(2)}`
            : `Insufficient funds — need $${cost.toFixed(2)}, have $${brokerageBalance.toFixed(2)}`}
        </p>
      )}

      {err && <p className="text-xs text-red-400">{err}</p>}

      <button
        onClick={submit}
        disabled={busy || !canAfford}
        className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {busy ? "Opening…" : `Confirm Trade · ${isNaN(shares) ? "0" : shares.toFixed(4)} shares`}
      </button>
    </div>
  );
}

function ScanContent() {

  // selectedModelConfigId: null = use active model from DB, otherwise a specific test model ID
  const [selectedModelConfigId, setSelectedModelConfigId] = useState<string | null>(null);
  const [dbModels, setDbModels] = useState<DBModel[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTradeFor, setOpenTradeFor] = useState<string | null>(null);
  const [addedTrades, setAddedTrades] = useState<Set<string>>(new Set());
  const [brokerageBalance, setBrokerageBalance] = useState(0);
  const [filterRisk, setFilterRisk] = useState<RiskLevel | "all">("all");
  const [filterDir, setFilterDir] = useState<"all" | "long" | "short">("all");
  const [sortBy, setSortBy] = useState<"confidence" | "rr" | "gain">("confidence");

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        const brokerage = d.accounts?.find((a: { type: string; balance: number }) => a.type === "brokerage");
        if (brokerage) setBrokerageBalance(brokerage.balance);
      })
      .catch(() => {});
    fetch("/api/admin/models")
      .then((r) => r.ok ? r.json() : [])
      .then((models) => { if (Array.isArray(models)) setDbModels(models); })
      .catch(() => {});
  }, []);

  async function runScan() {
    setLoading(true);
    setError(null);
    setResult(null);
    setOpenTradeFor(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          selectedModelConfigId
            ? { modelConfigId: selectedModelConfigId }   // specific test model
            : { model: "active" }                        // use active model from DB
        ),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Scan failed");
      else setResult(data);
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  const filteredPicks = useMemo(() => {
    if (!result) return [];
    return result.picks
      .filter((p) => filterRisk === "all" || p.riskLevel === filterRisk)
      .filter((p) => filterDir === "all" || p.direction === filterDir)
      .sort((a, b) => {
        if (sortBy === "confidence") return b.confidence - a.confidence;
        if (sortBy === "rr") {
          const rrVal = (p: typeof a) => parseFloat(p.riskRewardRatio?.split(":")[1] ?? "0");
          return rrVal(b) - rrVal(a);
        }
        return (b.maxGainDollar ?? 0) - (a.maxGainDollar ?? 0);
      });
  }, [result, filterRisk, filterDir, sortBy]);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight">AI Stock Scanner</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Hunting for diamonds in the rough — overlooked stocks with real potential.
        </p>
      </div>

      {/* Model selector — driven by DB */}
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">AI Model</p>
        <div className="flex flex-wrap gap-2">
          {/* Active model (always shown as default) */}
          {(() => {
            const active = dbModels.find(m => m.status === "active");
            return (
              <button onClick={() => setSelectedModelConfigId(null)}
                className={`rounded-xl border-2 px-4 py-2.5 text-left transition-all ${selectedModelConfigId === null ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground text-muted-foreground"}`}>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <p className="font-bold text-sm">{active?.name ?? "Active Model"}</p>
                  <span className="text-xs text-green-400">Active</span>
                </div>
                <p className="text-xs mt-0.5 opacity-70">Used by all portfolios</p>
              </button>
            );
          })()}

          {/* Test models (admin only — only shown when dbModels loaded) */}
          {dbModels.filter(m => m.status === "testing").map(m => (
            <button key={m.id} onClick={() => setSelectedModelConfigId(m.id)}
              className={`rounded-xl border-2 px-4 py-2.5 text-left transition-all ${selectedModelConfigId === m.id ? "border-yellow-400 bg-yellow-400/10" : "border-border hover:border-yellow-400/50 text-muted-foreground"}`}>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <p className="font-bold text-sm">{m.name}</p>
                <span className="text-xs text-yellow-400">Testing</span>
              </div>
              <p className="text-xs mt-0.5 opacity-70">{m.notes?.slice(0, 40) ?? "Paper only"}</p>
            </button>
          ))}

          {/* Compare — only if both keys available */}
          {dbModels.some(m => m.provider === "openai") && dbModels.some(m => m.provider === "claude") && (
            <button onClick={() => { setSelectedModelConfigId(null); /* handled server-side */ }}
              className="rounded-xl border-2 border-border hover:border-muted-foreground text-muted-foreground px-4 py-2.5 text-left transition-all">
              <p className="font-bold text-sm">Compare Both</p>
              <p className="text-xs mt-0.5 opacity-70">Surfaces consensus picks</p>
            </button>
          )}
        </div>
      </div>

      {/* Run button */}
      <button onClick={runScan} disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-8 py-3 font-black text-base hover:opacity-90 transition-opacity disabled:opacity-50">
        {loading ? <><span className="animate-spin text-lg">⟳</span> Scanning stocks…</> : "Run AI Scan"}
      </button>

      {loading && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground space-y-1">
          <p>⚡ Pulling live market data…</p>
          <p>🤖 AI is reading the stocks…</p>
          <p>📊 Crunching P/E ratios, earnings, and price trends…</p>
          <p className="text-xs mt-2 opacity-60">This usually takes 15–30 seconds.</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <span>{result.model}</span><span>·</span>
                <span>{new Date(result.scannedAt).toLocaleTimeString()}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-base leading-relaxed">{result.summary}</p>
              {result.estimatedCostUsd != null && (
                <p className="text-xs text-muted-foreground">
                  Estimated model spend: ${result.estimatedCostUsd.toFixed(4)}
                  {result.estimatedInputTokens != null && result.estimatedOutputTokens != null
                    ? ` · ~${result.estimatedInputTokens} input tokens / ~${result.estimatedOutputTokens} output tokens`
                    : ""}
                </p>
              )}
            </CardContent>
          </Card>

          {result.comparison && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Overlap
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-black">{result.comparison.overlapCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Symbols both models liked</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    OpenAI Only
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-black">{result.comparison.openaiOnly.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {result.comparison.openaiOnly.slice(0, 3).join(", ") || "No unique names"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Claude Only
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-black">{result.comparison.claudeOnly.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {result.comparison.claudeOnly.slice(0, 3).join(", ") || "No unique names"}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters + Sort */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Risk filter */}
            <div className="flex items-center gap-1 rounded-xl border border-border p-1">
              {(["all", "conservative", "moderate", "aggressive"] as const).map((r) => (
                <button key={r} onClick={() => setFilterRisk(r)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${filterRisk === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {r === "all" ? "All Risk" : r}
                </button>
              ))}
            </div>
            {/* Direction filter */}
            <div className="flex items-center gap-1 rounded-xl border border-border p-1">
              {(["all", "long", "short"] as const).map((d) => (
                <button key={d} onClick={() => setFilterDir(d)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${filterDir === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {d === "all" ? "Long + Short" : d}
                </button>
              ))}
            </div>
            {/* Sort */}
            <div className="flex items-center gap-1 rounded-xl border border-border p-1 ml-auto">
              <span className="text-xs text-muted-foreground px-2">Sort:</span>
              {([["confidence", "Confidence"], ["rr", "Risk:Reward"], ["gain", "Max Gain"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setSortBy(val)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${sortBy === val ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Picks */}
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
              {filteredPicks.length} of {result.picks.length} Pick{result.picks.length !== 1 ? "s" : ""}
            </p>
            <div className="grid gap-4">
              {filteredPicks.map((pick) => (
                <Card key={pick.symbol} className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className="flex items-start justify-between p-4 pb-3 border-b border-border">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-black text-primary">{pick.symbol}</span>
                        <div>
                          <p className="text-sm text-muted-foreground leading-none">{pick.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={`text-xs capitalize ${pick.direction === "long" ? "bg-green-400/20 text-green-400 border-green-400/30" : "bg-red-400/20 text-red-400 border-red-400/30"}`} variant="outline">
                              {pick.direction}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{pick.timeHorizon}</span>
                            {pick.agreementScore != null && (
                              <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                                {pick.sourceModels?.length === 2 ? "Consensus" : pick.sourceModels?.[0] ?? "Single"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {addedTrades.has(pick.symbol) ? (
                        <span className="text-xs text-green-400 font-semibold">✓ Trade opened</span>
                      ) : (
                        <button
                          onClick={() => setOpenTradeFor(openTradeFor === pick.symbol ? null : pick.symbol)}
                          className="text-xs rounded-lg border border-primary/50 text-primary px-3 py-1.5 font-semibold hover:bg-primary/10 transition-colors"
                        >
                          {openTradeFor === pick.symbol ? "Cancel" : "+ Open Trade"}
                        </button>
                      )}
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Confidence */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide font-semibold">AI Confidence</p>
                        <ConfidenceBar value={pick.confidence} />
                      </div>

                      {pick.setupQualityScore != null && (
                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center justify-between gap-4 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Setup Quality</p>
                            <p className="font-black text-base">{pick.setupQualityScore}/100</p>
                          </div>
                          <p className="text-xs text-muted-foreground max-w-xl">
                            {pick.trendSummary || "Historical trend data helped rank this setup before the model saw it."}
                          </p>
                        </div>
                      )}

                      {/* Risk / Reward */}
                      {pick.riskLevel && (() => {
                        const rc = RISK_CONFIG[pick.riskLevel] ?? RISK_CONFIG.moderate;
                        return (
                          <div className={`rounded-xl border px-4 py-3 flex flex-wrap items-center gap-4 text-sm ${rc.bg}`}>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-semibold">Risk Level</p>
                              <p className={`font-black text-base ${rc.color}`}>{rc.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{rc.desc}</p>
                            </div>
                            <div className="border-l border-border pl-4">
                              <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-semibold">Risk / Reward</p>
                              <p className="font-black text-base">{pick.riskRewardRatio}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">for every $1 risked</p>
                            </div>
                            <div className="border-l border-border pl-4">
                              <p className="text-xs text-red-400 mb-0.5 uppercase tracking-wide font-semibold">Max Loss/share</p>
                              <p className="font-bold text-red-400">${pick.maxLossDollar?.toFixed(2) ?? "—"}</p>
                            </div>
                            <div className="border-l border-border pl-4">
                              <p className="text-xs text-green-400 mb-0.5 uppercase tracking-wide font-semibold">Max Gain/share</p>
                              <p className="font-bold text-green-400">${pick.maxGainDollar?.toFixed(2) ?? "—"}</p>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Price targets */}
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="rounded-lg bg-muted/40 px-3 py-2">
                          <p className="text-xs text-muted-foreground mb-0.5">Entry Zone</p>
                          <p className="font-bold">${pick.entryZoneLow.toFixed(2)}–${pick.entryZoneHigh.toFixed(2)}</p>
                        </div>
                        <div className="rounded-lg bg-green-400/10 px-3 py-2">
                          <p className="text-xs text-green-400 mb-0.5">Target</p>
                          <p className="font-bold text-green-400">${pick.targetPrice.toFixed(2)}</p>
                        </div>
                        <div className="rounded-lg bg-red-400/10 px-3 py-2">
                          <p className="text-xs text-red-400 mb-0.5">Stop Loss</p>
                          <p className="font-bold text-red-400">${pick.stopLoss.toFixed(2)}</p>
                        </div>
                      </div>

                      {/* Key metrics */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide font-semibold">Why This Stock?</p>
                        <ul className="space-y-1">
                          {(pick.keyMetrics ?? []).map((m, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="text-primary mt-0.5 shrink-0">▸</span><span>{m}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Reasoning */}
                      <div className="rounded-xl bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide font-semibold">AI Reasoning</p>
                        <p className="text-sm leading-relaxed">{pick.reasoning}</p>
                      </div>

                      {pick.sourceModels && pick.sourceModels.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Source model{pick.sourceModels.length > 1 ? "s" : ""}: {pick.sourceModels.join(" + ")}
                          {pick.agreementScore != null ? ` · agreement ${pick.agreementScore}/2` : ""}
                        </div>
                      )}

                      {/* Trade form */}
                      {openTradeFor === pick.symbol && (
                        <OpenTradePanel
                          pick={pick}
                          brokerageBalance={brokerageBalance}
                          onAdded={() => {
                            setAddedTrades((s) => new Set([...s, pick.symbol]));
                            setOpenTradeFor(null);
                            // Refresh balance
                            fetch("/api/accounts").then((r) => r.json()).then((d) => {
                              const b = d.accounts?.find((a: { type: string; balance: number }) => a.type === "brokerage");
                              if (b) setBrokerageBalance(b.balance);
                            });
                          }}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <button onClick={runScan} className="text-sm text-muted-foreground hover:text-foreground underline">
            Run another scan
          </button>
        </div>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground text-sm animate-pulse">Loading…</div>}>
      <ScanContent />
    </Suspense>
  );
}
