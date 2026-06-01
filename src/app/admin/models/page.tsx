"use client";

import { useEffect, useState } from "react";

interface AIModel {
  id: string; name: string; provider: string; modelId: string;
  customPrompt: string | null; status: string; paperOnly: string;
  notes: string | null; createdAt: string;
}

const STATUS_CONFIG = {
  active:  { label: "Active",   color: "text-green-400",  bg: "bg-green-400/15 border-green-400/40",  dot: "bg-green-400" },
  testing: { label: "Testing",  color: "text-yellow-400", bg: "bg-yellow-400/15 border-yellow-400/40", dot: "bg-yellow-400" },
  retired: { label: "Retired",  color: "text-muted-foreground", bg: "bg-muted/20 border-border", dot: "bg-muted-foreground" },
};

export default function AdminModelsPage() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", provider: "openai", modelId: "gpt-4o", customPrompt: "", notes: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/models");
    if (!res.ok) { setError("Access denied or error loading models"); setLoading(false); return; }
    setModels(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function promote(id: string) {
    setSaving(true);
    const res = await fetch("/api/admin/models", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "active", paperOnly: "false" }) });
    if (res.ok) await load();
    setSaving(false);
  }

  async function retire(id: string) {
    if (!confirm("Retire this model? It will no longer be used.")) return;
    await fetch("/api/admin/models", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "retired" }) });
    await load();
  }

  async function updateModel(id: string, updates: Partial<AIModel>) {
    setSaving(true);
    await fetch("/api/admin/models", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
    setEditing(null);
    await load();
    setSaving(false);
  }

  async function createModel() {
    if (!form.name) return;
    setSaving(true);
    await fetch("/api/admin/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setCreating(false);
    setForm({ name: "", provider: "openai", modelId: "gpt-4o", customPrompt: "", notes: "" });
    await load();
    setSaving(false);
  }

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (error) return <div className="text-red-400 text-sm p-4 rounded-xl border border-red-400/30 bg-red-400/5">{error}</div>;

  const active = models.find(m => m.status === "active");
  const testing = models.filter(m => m.status === "testing");
  const retired = models.filter(m => m.status === "retired");

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <p className="text-xs text-yellow-400 font-semibold uppercase tracking-widest mb-1">Admin Only</p>
        <h1 className="text-2xl font-black tracking-tight">AI Model Management</h1>
        <p className="text-muted-foreground text-sm mt-1">
          The active model is used by all users for auto-trade and Deploy Capital. Test models are paper-only.
        </p>
      </div>

      {/* Active model */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-3">Active Model</p>
        {active ? (
          <ModelCard model={active} onRetire={() => retire(active.id)} onEdit={() => setEditing(active.id)} isEditing={editing === active.id} onSave={(u) => updateModel(active.id, u)} saving={saving} />
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
            No active model. Promote a test model to activate it.
          </div>
        )}
      </div>

      {/* Test models */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Test Models (paper only)</p>
          <button onClick={() => setCreating(true)} className="text-xs px-3 py-1.5 rounded-lg border border-primary/50 text-primary hover:bg-primary/10 transition-colors">+ New Test Model</button>
        </div>

        {creating && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 mb-4">
            <p className="text-sm font-semibold">New Test Model</p>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Name (e.g. Claude Experimental)" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="col-span-2 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <select value={form.provider} onChange={e => setForm(f => ({...f, provider: e.target.value}))} className="bg-background border border-border rounded-lg px-3 py-2 text-sm">
                <option value="openai">OpenAI</option>
                <option value="claude">Anthropic Claude</option>
              </select>
              <input placeholder="Model ID (e.g. gpt-4o)" value={form.modelId} onChange={e => setForm(f => ({...f, modelId: e.target.value}))} className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <textarea placeholder="Custom system prompt (optional — overrides default)" value={form.customPrompt} onChange={e => setForm(f => ({...f, customPrompt: e.target.value}))} rows={3} className="col-span-2 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} className="col-span-2 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-2">
              <button onClick={createModel} disabled={saving || !form.name} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50">Create</button>
              <button onClick={() => setCreating(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {testing.length === 0 && !creating && <p className="text-sm text-muted-foreground">No test models. Create one to start experimenting.</p>}
          {testing.map(m => (
            <ModelCard key={m.id} model={m}
              onPromote={() => promote(m.id)}
              onRetire={() => retire(m.id)}
              onEdit={() => setEditing(m.id)}
              isEditing={editing === m.id}
              onSave={(u) => updateModel(m.id, u)}
              saving={saving} />
          ))}
        </div>
      </div>

      {/* Retired */}
      {retired.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-3">Retired</p>
          <div className="space-y-2">
            {retired.map(m => (
              <div key={m.id} className="rounded-xl border border-border px-4 py-3 flex items-center justify-between opacity-50">
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.provider} · {m.modelId}</p>
                </div>
                <button onClick={() => updateModel(m.id, { status: "testing" })} className="text-xs text-muted-foreground hover:text-foreground underline">Restore</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelCard({ model, onPromote, onRetire, onEdit, isEditing, onSave, saving }: {
  model: AIModel; onPromote?: () => void; onRetire?: () => void;
  onEdit?: () => void; isEditing?: boolean; onSave?: (u: Partial<AIModel>) => void; saving?: boolean;
}) {
  const cfg = STATUS_CONFIG[model.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.testing;
  const [draft, setDraft] = useState({ customPrompt: model.customPrompt ?? "", notes: model.notes ?? "" });

  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${cfg.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          <p className="font-black text-base">{model.name}</p>
          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
          {model.paperOnly === "true" && <span className="text-xs text-yellow-400 border border-yellow-400/40 px-1.5 py-0.5 rounded">Paper Only</span>}
        </div>
        <div className="flex gap-2 shrink-0">
          {onEdit && <button onClick={onEdit} className="text-xs text-muted-foreground hover:text-foreground underline">{isEditing ? "Cancel" : "Edit"}</button>}
          {onPromote && <button onClick={onPromote} disabled={saving} className="text-xs rounded-lg bg-green-500 text-white px-3 py-1 font-bold hover:opacity-90 disabled:opacity-50">Promote to Active</button>}
          {onRetire && model.status !== "active" && <button onClick={onRetire} className="text-xs text-muted-foreground hover:text-red-400 underline">Retire</button>}
        </div>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p><span className="font-semibold text-foreground">Provider:</span> {model.provider} · {model.modelId}</p>
        {model.notes && <p><span className="font-semibold text-foreground">Notes:</span> {model.notes}</p>}
        {model.customPrompt && <p className="text-xs"><span className="font-semibold text-foreground">Custom prompt:</span> {model.customPrompt.slice(0, 100)}{model.customPrompt.length > 100 ? "…" : ""}</p>}
      </div>
      {isEditing && onSave && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <textarea value={draft.customPrompt} onChange={e => setDraft(d => ({...d, customPrompt: e.target.value}))} placeholder="Custom system prompt (leave blank to use default)" rows={4} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
          <input value={draft.notes} onChange={e => setDraft(d => ({...d, notes: e.target.value}))} placeholder="Notes" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
          <button onClick={() => onSave({ customPrompt: draft.customPrompt || null, notes: draft.notes || null })} disabled={saving} className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold hover:opacity-90 disabled:opacity-50">Save</button>
        </div>
      )}
    </div>
  );
}
