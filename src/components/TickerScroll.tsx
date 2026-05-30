"use client";

export interface TickerItem {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
}

export default function TickerScroll({ items }: { items: TickerItem[] }) {
  if (!items.length) return null;

  // Duplicate so the loop is seamless
  const doubled = [...items, ...items];

  return (
    <div className="w-full bg-[#0a0d16] border-b border-border overflow-hidden h-8 flex items-center">
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
    </div>
  );
}
