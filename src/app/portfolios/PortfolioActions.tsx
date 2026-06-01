"use client";

interface Props { portfolioId: string; isActive: boolean; }

export default function PortfolioActions({ portfolioId, isActive }: Props) {
  async function switchAndGo() {
    await fetch("/api/portfolios/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioId }),
    });
    window.location.href = "/accounts";
  }

  return (
    <div className="flex gap-2 pt-1">
      <button onClick={switchAndGo}
        className="flex-1 rounded-xl border border-border py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
        {isActive ? "View Portfolio" : "View Portfolio"}
      </button>
      {!isActive && (
        <button onClick={switchAndGo}
          className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:opacity-90 transition-opacity">
          Switch
        </button>
      )}
    </div>
  );
}
