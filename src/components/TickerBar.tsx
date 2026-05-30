"use client";

import { useEffect, useState } from "react";

interface TickerItem {
  symbol: string;
  price: number;
  changePct: number;
}

export default function TickerBar() {
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    fetch("/api/stocks")
      .then((r) => r.json())
      .then((data: TickerItem[]) => {
        if (Array.isArray(data)) setItems(data.slice(0, 30));
      })
      .catch(() => {});
  }, []);

  // Always render the bar — shows loading state until data arrives
  const doubled = items.length ? [...items, ...items] : [];

  return (
    <div className="w-full bg-[#0a0d16] border-b border-border overflow-hidden h-8 flex items-center">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground px-4 animate-pulse">Loading market data…</p>
      ) : (
        <div className="flex animate-ticker whitespace-nowrap">
          {doubled.map((item, i) => {
            const up = item.changePct >= 0;
            return (
              <span key={i} className="inline-flex items-center gap-1.5 px-5 text-xs font-medium">
                <span className="font-bold text-white">{item.symbol}</span>
                <span className="text-muted-foreground">${item.price.toFixed(2)}</span>
                <span className={up ? "text-green-400" : "text-red-400"}>
                  {up ? "▲" : "▼"} {Math.abs(item.changePct).toFixed(2)}%
                </span>
                <span className="text-border ml-3">│</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
