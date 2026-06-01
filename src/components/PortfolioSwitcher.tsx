"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Portfolio { id: string; name: string; mode: string; broker: string; }

interface Props { activeId: string | null; }

export default function PortfolioSwitcher({ activeId }: Props) {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState("paper");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/portfolios").then(r => r.json()).then(d => setPortfolios(d.portfolios ?? []));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function switchTo(id: string) {
    await fetch("/api/portfolios/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portfolioId: id }) });
    setOpen(false);
    // Use replace with a cache-busting param so client components fully remount
    router.replace(`?p=${id.slice(0, 8)}`);
    router.refresh();
  }

  async function createPortfolio() {
    if (!newName.trim()) return;
    const res = await fetch("/api/portfolios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim(), mode: newMode }) });
    const portfolio = await res.json();
    setPortfolios(prev => [...prev, portfolio]);
    setCreating(false);
    setNewName("");
    await switchTo(portfolio.id);
  }

  const active = portfolios.find(p => p.id === activeId) ?? portfolios[0];

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-accent transition-colors text-xs">
        <span className={`w-1.5 h-1.5 rounded-full ${active?.mode === "live" ? "bg-green-400" : "bg-yellow-400"}`} />
        <span className="font-semibold max-w-[100px] truncate">{active?.name ?? "Portfolio"}</span>
        <span className="text-muted-foreground">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-border bg-card shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Portfolios</p>
          </div>
          {portfolios.map(p => (
            <button key={p.id} onClick={() => switchTo(p.id)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-accent transition-colors ${p.id === activeId ? "bg-primary/10 text-primary" : ""}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.mode === "live" ? "bg-green-400" : "bg-yellow-400"}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{p.mode} · {p.broker}</p>
              </div>
              {p.id === activeId && <span className="text-primary text-xs">✓</span>}
            </button>
          ))}

          {creating ? (
            <div className="px-3 py-2 border-t border-border space-y-2">
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Portfolio name" onKeyDown={e => e.key === "Enter" && createPortfolio()}
                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
              <div className="flex gap-1">
                <button onClick={() => setNewMode(m => m === "paper" ? "live" : "paper")}
                  className={`flex-1 text-xs py-1 rounded-lg border transition-colors ${newMode === "paper" ? "border-yellow-400 text-yellow-400" : "border-green-400 text-green-400"}`}>
                  {newMode === "paper" ? "📄 Paper" : "💰 Live"}
                </button>
                <button onClick={createPortfolio} className="flex-1 text-xs py-1 rounded-lg bg-primary text-primary-foreground">Create</button>
                <button onClick={() => setCreating(false)} className="px-2 text-xs text-muted-foreground">✕</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCreating(true)}
              className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-left border-t border-border">
              + New Portfolio
            </button>
          )}
        </div>
      )}
    </div>
  );
}
