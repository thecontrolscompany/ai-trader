"use client";

import { useEffect, useMemo, useState } from "react";
import type { StockRow } from "@/app/api/stocks/route";

type SortKey = keyof StockRow;
type SortDir = "asc" | "desc";

function fmt(n: number | null, decimals = 2, prefix = "") {
  if (n == null) return <span className="text-muted-foreground">—</span>;
  return `${prefix}${n.toFixed(decimals)}`;
}

function fmtBig(n: number | null) {
  if (n == null) return <span className="text-muted-foreground">—</span>;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtVol(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "symbol",      label: "Symbol",     align: "left"  },
  { key: "name",        label: "Company",    align: "left"  },
  { key: "price",       label: "Price",      align: "right" },
  { key: "change",      label: "Chg $",      align: "right" },
  { key: "changePct",   label: "Chg %",      align: "right" },
  { key: "volume",      label: "Volume",     align: "right" },
  { key: "avgVolume",   label: "Avg Vol",    align: "right" },
  { key: "marketCap",   label: "Mkt Cap",    align: "right" },
  { key: "pe",          label: "P/E",        align: "right" },
  { key: "eps",         label: "EPS",        align: "right" },
  { key: "beta",        label: "Beta",       align: "right" },
  { key: "weekHigh52",  label: "52W High",   align: "right" },
  { key: "weekLow52",   label: "52W Low",    align: "right" },
  { key: "dividendYield", label: "Div Yield", align: "right" },
];

export default function StocksPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/stocks")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRows(data);
        else setError(data.error ?? "Unknown error");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        r.symbol.toLowerCase().includes(search.toLowerCase()) ||
        r.name.toLowerCase().includes(search.toLowerCase())
    );
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === "asc" ? Infinity : -Infinity);
      const bv = b[sortKey] ?? (sortDir === "asc" ? Infinity : -Infinity);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [rows, sortKey, sortDir, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Top 100 Stocks</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Most active US equities · delayed · click any column to sort
          </p>
        </div>
        <input
          type="text"
          placeholder="Search symbol or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm w-52 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {loading && (
        <div className="text-muted-foreground text-sm py-10 text-center">Loading…</div>
      )}
      {error && (
        <div className="text-destructive text-sm py-10 text-center">{error}</div>
      )}

      {!loading && !error && (
        <div className="rounded-xl border border-border overflow-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`px-3 py-2.5 font-semibold text-xs uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-primary transition-colors ${
                      col.align === "right" ? "text-right" : "text-left"
                    } ${sortKey === col.key ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((r) => (
                <tr
                  key={r.symbol}
                  className="hover:bg-accent/40 transition-colors"
                >
                  <td className="px-3 py-2 font-bold text-primary whitespace-nowrap">
                    {r.symbol}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">
                    {r.name}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    ${r.price.toFixed(2)}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${r.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {r.change >= 0 ? "+" : ""}{r.change.toFixed(2)}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${r.changePct >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {r.changePct >= 0 ? "+" : ""}{r.changePct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmtVol(r.volume)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmtVol(r.avgVolume)}</td>
                  <td className="px-3 py-2 text-right">{fmtBig(r.marketCap)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.pe)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.eps, 2, "$")}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.beta)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.weekHigh52, 2, "$")}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.weekLow52, 2, "$")}</td>
                  <td className="px-3 py-2 text-right">
                    {r.dividendYield != null
                      ? `${(r.dividendYield * 100).toFixed(2)}%`
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
