"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Settings {
  enabled: string; model: string;
  minConfidence: number; maxTradesPerDay: number; maxPositionPct: number;
  autoClose: string; scanFrequency: string; deployMode: string;
  lastRunAt: string | null; lastRunSummary: string | null;
}
interface LogEntry {
  id: string; action: string; ticker: string | null;
  reason: string | null; createdAt: string;
}

const ACTION_COLOR: Record<string, string> = {
  opened: "text-green-400", closed: "text-blue-400",
  skipped: "text-muted-foreground", error: "text-red-400",
};

export default function AutoTradePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{
    summary: string; opened: string[]; closed: string[];
    skipped: string[]; errors: string[];
  } | null>(null);
  const [brokerageBalance, setBrokerageBalance] = useState<number | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/auto-trade");
      if (!res.ok) { setLoadError(`Server error ${res.status}`); return; }
      const data = await res.json();
      if (!data.settings) { setLoadError("Settings not returned from server"); return; }
      setSettings(data.settings);
      setLog(data.log ?? []);
    } catch (e) {
      setLoadError(`Network error: ${e}`);
    }
  }
  useEffect(() => {
    load();
    fetch("/api/accounts").then(r => r.json()).then(d => {
      const b = d.accounts?.find((a: {type: string}) => a.type === "brokerage");
      if (b) setBrokerageBalance(b.balance);
    }).catch(() => {});
  }, []);

  async function save(patch: Partial<Settings>) {
    setSaving(true);
    const res = await fetch("/api/auto-trade", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const updated = await res.json();
    setSettings(updated);
    setSaving(false);
  }

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    const res = await fetch("/api/auto-trade/run", { method: "POST" });
    const data = await res.json();
    setRunResult({
      summary: data.summary ?? data.error ?? "Done",
      opened:  data.opened  ?? [],
      closed:  data.closed  ?? [],
      skipped: data.skipped ?? [],
      errors:  data.errors  ?? [],
    });
    await load();
    // refresh balance
    fetch("/api/accounts").then(r => r.json()).then(d => {
      const b = d.accounts?.find((a: {type: string}) => a.type === "brokerage");
      if (b) setBrokerageBalance(b.balance);
    }).catch(() => {});
    setRunning(false);
  }

  if (loadError) return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-black">Auto Trading</h1>
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-semibold mb-1">Failed to load settings</p>
        <p className="font-mono text-xs">{loadError}</p>
      </div>
      <button onClick={() => { setLoadError(null); load(); }}
        className="text-sm text-primary underline">Try again</button>
    </div>
  );

  if (!settings) return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-black">Auto Trading</h1>
      <p className="text-muted-foreground text-sm animate-pulse">Loading settings…</p>
    </div>
  );

  const isEnabled = settings.enabled === "true";

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Auto Trading</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI scans and trades automatically on your behalf. <span className="text-yellow-400 font-semibold">Paper trades only — no real money.</span>
        </p>
      </div>

      {/* Master toggle */}
      <Card className={isEnabled ? "border-green-400/40" : ""}>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="font-black text-lg">{isEnabled ? "🟢 Auto-trading ON" : "⚪ Auto-trading OFF"}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isEnabled
                ? "AI will scan daily at market open and place paper trades automatically."
                : "Enable to let AI place trades automatically."}
            </p>
          </div>
          <button
            onClick={() => save({ enabled: isEnabled ? "false" : "true" })}
            disabled={saving}
            className={`w-14 h-8 rounded-full transition-colors relative ${isEnabled ? "bg-green-500" : "bg-muted"}`}
          >
            <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${isEnabled ? "left-7" : "left-1"}`} />
          </button>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader><CardTitle className="text-base">Settings</CardTitle></CardHeader>
        <CardContent className="space-y-5">

          {/* AI Model */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold block mb-2">AI Model</label>
            <div className="grid grid-cols-2 gap-2">
              {["openai", "claude"].map((m) => (
                <button key={m} onClick={() => save({ model: m })}
                  className={`rounded-xl border-2 py-2.5 text-sm font-bold capitalize transition-colors ${settings.model === m ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
                  {m === "openai" ? "GPT-4o" : "Claude Sonnet"}
                </button>
              ))}
            </div>
          </div>

          {/* Min confidence */}
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Min Confidence</label>
              <span className="text-sm font-bold text-primary">{Math.round(settings.minConfidence * 100)}%</span>
            </div>
            <input type="range" min="50" max="95" step="5"
              value={Math.round(settings.minConfidence * 100)}
              onChange={(e) => save({ minConfidence: Number(e.target.value) / 100 })}
              className="w-full accent-primary" />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>50% (more trades)</span><span>95% (fewer, higher quality)</span>
            </div>
          </div>

          {/* Max trades / day */}
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Max Trades / Day</label>
              <span className="text-sm font-bold text-primary">{settings.maxTradesPerDay}</span>
            </div>
            <input type="range" min="1" max="10" step="1"
              value={settings.maxTradesPerDay}
              onChange={(e) => save({ maxTradesPerDay: Number(e.target.value) })}
              className="w-full accent-primary" />
          </div>

          {/* Capital deployment mode */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold block mb-2">Capital Deployment</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {([
                { value: "spread", label: "Spread evenly", desc: "Divide available cash across all picks — deploys most of the balance" },
                { value: "fixed",  label: "Fixed % each",  desc: `${Math.round(settings.maxPositionPct * 100)}% per trade — leaves more idle cash` },
              ] as const).map((opt) => (
                <button key={opt.value} onClick={() => save({ deployMode: opt.value })}
                  className={`rounded-xl border-2 p-3 text-left text-xs transition-colors ${
                    (settings.deployMode ?? "spread") === opt.value
                      ? "border-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}>
                  <p className="font-bold mb-0.5">{opt.label}</p>
                  <p className="opacity-60 leading-tight">{opt.desc}</p>
                </button>
              ))}
            </div>
            {(settings.deployMode ?? "spread") === "fixed" && (
              <>
                <div className="flex justify-between mb-1">
                  <label className="text-xs text-muted-foreground font-semibold">Fixed % per trade</label>
                  <span className="text-sm font-bold text-primary">{Math.round(settings.maxPositionPct * 100)}%</span>
                </div>
                <input type="range" min="1" max="50" step="1"
                  value={Math.round(settings.maxPositionPct * 100)}
                  onChange={(e) => save({ maxPositionPct: Number(e.target.value) / 100 })}
                  className="w-full accent-primary" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>1% (very small)</span><span>50% (half the balance)</span>
                </div>
              </>
            )}
          </div>

          {/* Scan frequency */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold block mb-2">
              Scan Frequency
              <span className="ml-2 normal-case font-normal text-muted-foreground">(requires Vercel Pro)</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {([
                { value: "1x", label: "1×/day",  desc: "9:30 AM" },
                { value: "2x", label: "2×/day",  desc: "Open + Noon" },
                { value: "3x", label: "3×/day",  desc: "+ 1:30 PM" },
                { value: "4x", label: "4×/day",  desc: "+ 3:00 PM" },
              ] as const).map((opt) => (
                <button key={opt.value} onClick={() => save({ scanFrequency: opt.value })}
                  className={`rounded-xl border-2 py-2 text-xs text-center transition-colors ${
                    (settings.scanFrequency ?? "4x") === opt.value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}>
                  <p className="font-bold">{opt.label}</p>
                  <p className="opacity-60 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Auto-close */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Auto-close positions</p>
              <p className="text-xs text-muted-foreground">Automatically sell when stop loss or take profit is hit</p>
            </div>
            <button onClick={() => save({ autoClose: settings.autoClose === "true" ? "false" : "true" })}
              className={`w-12 h-7 rounded-full transition-colors relative shrink-0 ${settings.autoClose === "true" ? "bg-green-500" : "bg-muted"}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${settings.autoClose === "true" ? "left-6" : "left-1"}`} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Schedule info */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">⏰ Schedule</p>
            {brokerageBalance !== null && (
              <p className="text-xs text-muted-foreground">
                Brokerage: <span className={brokerageBalance < 10 ? "text-red-400 font-bold" : "text-foreground font-semibold"}>
                  ${brokerageBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </p>
            )}
          </div>

          {brokerageBalance !== null && brokerageBalance < 10 && (
            <div className="rounded-xl bg-yellow-400/10 border border-yellow-400/30 px-3 py-2 text-xs text-yellow-400">
              ⚠️ Brokerage balance is too low to open trades. Go to <strong>Portfolio → Move Money</strong> to deposit funds and transfer to Brokerage.
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {{
              "1x": "Scans once at 9:30 AM ET (market open).",
              "2x": "Scans at 9:30 AM and 11:30 AM ET.",
              "3x": "Scans at 9:30 AM, 11:30 AM, and 1:30 PM ET.",
              "4x": "Scans at 9:30 AM, 11:30 AM, 1:30 PM, and 3:00 PM ET.",
            }[settings.scanFrequency ?? "4x"] ?? ""}
            {" "}Monday–Friday only. Run Now ignores schedule.
          </p>
          {settings.lastRunAt && (
            <p className="text-xs text-muted-foreground">Last run: {new Date(settings.lastRunAt).toLocaleString()}</p>
          )}

          <button onClick={runNow} disabled={running}
            className="w-full rounded-xl border border-primary/50 text-primary py-2.5 text-sm font-bold hover:bg-primary/10 transition-colors disabled:opacity-50">
            {running ? "⟳ Running scan…" : "▶ Run Now"}
          </button>

          {runResult && (
            <div className="rounded-xl bg-card border border-border p-4 space-y-3 text-sm">
              <p className="font-semibold">{runResult.summary}</p>
              {runResult.opened.length > 0 && (
                <div>
                  <p className="text-xs text-green-400 uppercase tracking-wide font-bold mb-1">✓ Opened</p>
                  {runResult.opened.map((s, i) => <p key={i} className="text-xs text-green-400">{s}</p>)}
                </div>
              )}
              {runResult.closed.length > 0 && (
                <div>
                  <p className="text-xs text-blue-400 uppercase tracking-wide font-bold mb-1">↩ Closed</p>
                  {runResult.closed.map((s, i) => <p key={i} className="text-xs text-blue-400">{s}</p>)}
                </div>
              )}
              {runResult.skipped.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-bold mb-1">— Skipped</p>
                  {runResult.skipped.map((s, i) => <p key={i} className="text-xs text-muted-foreground">{s}</p>)}
                </div>
              )}
              {runResult.errors.length > 0 && (
                <div>
                  <p className="text-xs text-red-400 uppercase tracking-wide font-bold mb-1">✗ Errors</p>
                  {runResult.errors.map((s, i) => <p key={i} className="text-xs text-red-400">{s}</p>)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity log */}
      {log.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-3">Activity Log</p>
          <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
            {log.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between px-4 py-3">
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase ${ACTION_COLOR[entry.action] ?? "text-muted-foreground"}`}>
                      {entry.action}
                    </span>
                    {entry.ticker && <span className="font-bold text-sm">{entry.ticker}</span>}
                  </div>
                  {entry.reason && <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.reason}</p>}
                </div>
                <p className="text-xs text-muted-foreground shrink-0">
                  {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
