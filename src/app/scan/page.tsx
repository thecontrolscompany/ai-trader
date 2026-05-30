"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScanModel, ScanResult } from "@/app/api/scan/route";

const MODELS: { value: ScanModel; label: string; desc: string }[] = [
  { value: "claude", label: "Claude Sonnet", desc: "Anthropic · Great at nuanced reasoning" },
  { value: "openai", label: "GPT-4o", desc: "OpenAI · Fast and thorough" },
];

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

export default function ScanPage() {
  const [selectedModel, setSelectedModel] = useState<ScanModel>("claude");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedTrades, setAddedTrades] = useState<Set<string>>(new Set());

  async function runScan() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Scan failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  async function openTrade(pick: ScanResult["picks"][number]) {
    const res = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: pick.symbol,
        direction: pick.direction === "short" ? "short" : "long",
        entryPrice: pick.entryZoneLow,
        quantity: 1,
        stopLoss: pick.stopLoss,
        takeProfit: pick.targetPrice,
        notes: pick.reasoning,
        aiSignalId: pick.signalId,
      }),
    });
    if (res.ok) {
      setAddedTrades((s) => new Set([...s, pick.symbol]));
    }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight">AI Stock Scanner</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Let AI scan the top 100 most active stocks and flag the best beginner-friendly opportunities.
        </p>
      </div>

      {/* Model selector */}
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Choose AI Model</p>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {MODELS.map((m) => (
            <button
              key={m.value}
              onClick={() => setSelectedModel(m.value)}
              className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
                selectedModel === m.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border hover:border-muted-foreground text-muted-foreground"
              }`}
            >
              <p className="font-bold text-sm">{m.label}</p>
              <p className="text-xs mt-0.5 opacity-70">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={runScan}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-8 py-3 font-black text-base hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? (
          <>
            <span className="animate-spin text-lg">⟳</span>
            Scanning 100 stocks…
          </>
        ) : (
          "Run AI Scan"
        )}
      </button>

      {loading && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground space-y-1">
          <p>⚡ Pulling live market data…</p>
          <p>🤖 AI is reading 100 stocks…</p>
          <p>📊 Crunching P/E ratios, earnings, and price trends…</p>
          <p className="text-xs mt-2 opacity-60">This usually takes 15–30 seconds.</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <span>{result.model}</span>
                <span>·</span>
                <span>{new Date(result.scannedAt).toLocaleTimeString()}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-relaxed">{result.summary}</p>
            </CardContent>
          </Card>

          {/* Picks */}
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
              {result.picks.length} Picks Found
            </p>
            <div className="grid gap-4">
              {result.picks.map((pick) => (
                <Card key={pick.symbol} className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header row */}
                    <div className="flex items-start justify-between p-4 pb-3 border-b border-border">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-black text-primary">{pick.symbol}</span>
                        <div>
                          <p className="text-sm text-muted-foreground leading-none">{pick.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge
                              className={`text-xs capitalize ${
                                pick.direction === "long"
                                  ? "bg-green-400/20 text-green-400 border-green-400/30"
                                  : "bg-red-400/20 text-red-400 border-red-400/30"
                              }`}
                              variant="outline"
                            >
                              {pick.direction}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{pick.timeHorizon}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => openTrade(pick)}
                        disabled={addedTrades.has(pick.symbol)}
                        className="text-xs rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {addedTrades.has(pick.symbol) ? "✓ Added" : "+ Open Trade"}
                      </button>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Confidence */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide font-semibold">AI Confidence</p>
                        <ConfidenceBar value={pick.confidence} />
                      </div>

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
                              <span className="text-primary mt-0.5 shrink-0">▸</span>
                              <span>{m}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Plain-English reasoning */}
                      <div className="rounded-xl bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide font-semibold">AI Reasoning</p>
                        <p className="text-sm leading-relaxed">{pick.reasoning}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Re-scan */}
          <button
            onClick={runScan}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Run another scan
          </button>
        </div>
      )}
    </div>
  );
}
