"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface QuoteState {
  price: number | null;
  loading: boolean;
  error: string | null;
}

export default function NewTradePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteState>({ price: null, loading: false, error: null });

  const [form, setForm] = useState({
    ticker: "",
    assetClass: "stock",
    direction: "long",
    entryPrice: "",
    quantity: "",
    stopLoss: "",
    takeProfit: "",
    notes: "",
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function lookupQuote() {
    if (!form.ticker) return;
    setQuote({ price: null, loading: true, error: null });
    try {
      const res = await fetch(`/api/market?ticker=${form.ticker}`);
      const data = await res.json();
      if (!res.ok) {
        setQuote({ price: null, loading: false, error: data.error });
      } else {
        setQuote({ price: data.price, loading: false, error: null });
        set("entryPrice", String(data.price));
      }
    } catch {
      setQuote({ price: null, loading: false, error: "Lookup failed" });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: form.ticker,
          assetClass: form.assetClass,
          direction: form.direction,
          entryPrice: parseFloat(form.entryPrice),
          quantity: parseFloat(form.quantity),
          stopLoss: form.stopLoss ? parseFloat(form.stopLoss) : null,
          takeProfit: form.takeProfit ? parseFloat(form.takeProfit) : null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create trade");
      } else {
        router.push(`/trades/${data.id}`);
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Paper Trade</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Enter a hypothetical trade to track and evaluate.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trade Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Ticker */}
            <div className="space-y-1">
              <Label htmlFor="ticker">Ticker Symbol</Label>
              <div className="flex gap-2">
                <Input
                  id="ticker"
                  placeholder="e.g. AAPL, SPY, TLT"
                  value={form.ticker}
                  onChange={(e) => set("ticker", e.target.value.toUpperCase())}
                  className="uppercase"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={lookupQuote}
                  disabled={!form.ticker || quote.loading}
                >
                  {quote.loading ? "..." : "Get Price"}
                </Button>
              </div>
              {quote.price != null && (
                <p className="text-xs text-green-600">
                  Current price: ${quote.price.toFixed(2)} (loaded into entry price)
                </p>
              )}
              {quote.error && (
                <p className="text-xs text-red-500">{quote.error}</p>
              )}
            </div>

            {/* Asset Class + Direction */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Asset Class</Label>
                <Select value={form.assetClass} onValueChange={(v) => v && set("assetClass", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock">Stock</SelectItem>
                    <SelectItem value="etf">ETF</SelectItem>
                    <SelectItem value="bond">Bond</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="option">Option</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Direction</Label>
                <Select value={form.direction} onValueChange={(v) => v && set("direction", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="long">Long (Buy)</SelectItem>
                    <SelectItem value="short">Short (Sell)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Entry Price + Quantity */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="entryPrice">Entry Price ($)</Label>
                <Input
                  id="entryPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.entryPrice}
                  onChange={(e) => set("entryPrice", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="quantity">Quantity / Shares</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="0"
                  value={form.quantity}
                  onChange={(e) => set("quantity", e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Stop Loss + Take Profit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="stopLoss">Stop Loss ($)</Label>
                <Input
                  id="stopLoss"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Optional"
                  value={form.stopLoss}
                  onChange={(e) => set("stopLoss", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="takeProfit">Take Profit ($)</Label>
                <Input
                  id="takeProfit"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Optional"
                  value={form.takeProfit}
                  onChange={(e) => set("takeProfit", e.target.value)}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="notes">Notes / Thesis</Label>
              <Textarea
                id="notes"
                placeholder="Why are you entering this trade?"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Open Trade"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
