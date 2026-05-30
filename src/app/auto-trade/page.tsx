"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Settings {
  enabled: string; model: string;
  minConfidence: number; maxTradesPerDay: number; maxPositionPct: number;
  autoClose: string; lastRunAt: string | null; lastRunSummary: string | null;
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
  const [runResult, setRunResult] = useState<string | null>(null);

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
  useEffect(() => { load(); }, []);

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
    setRunResult(data.summary ?? data.error ?? "Done");
    await load();
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

          {/* Max position size */}
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Max Position Size</label>
              <span className="text-sm font-bold text-primary">{Math.round(settings.maxPositionPct * 100)}% of brokerage</span>
            </div>
            <input type="range" min="1" max="25" step="1"
              value={Math.round(settings.maxPositionPct * 100)}
              onChange={(e) => save({ maxPositionPct: Number(e.target.value) / 100 })}
              className="w-full accent-primary" />
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
          <p className="text-sm font-semibold">⏰ Schedule</p>
          <p className="text-sm text-muted-foreground">Auto-trade runs daily at <strong>9:30 AM ET</strong> (Monday–Friday) when the market opens.</p>
          {settings.lastRunAt && (
            <p className="text-xs text-muted-foreground">Last run: {new Date(settings.lastRunAt).toLocaleString()}</p>
          )}
          {settings.lastRunSummary && (
            <p className="text-sm rounded-xl bg-muted/40 px-3 py-2">{settings.lastRunSummary}</p>
          )}
          <button onClick={runNow} disabled={running}
            className="w-full rounded-xl border border-primary/50 text-primary py-2.5 text-sm font-bold hover:bg-primary/10 transition-colors disabled:opacity-50">
            {running ? "⟳ Running scan…" : "▶ Run Now (manual trigger)"}
          </button>
          {runResult && (
            <div className="rounded-xl bg-card border border-border p-3 text-sm">{runResult}</div>
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
