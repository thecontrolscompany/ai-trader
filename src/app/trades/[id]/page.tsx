"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calcRealizedPnl, formatPnl, pnlColor } from "@/lib/pnl";
import type { Trade } from "@/lib/types";

export default function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [exitPrice, setExitPrice] = useState("");
  const [closing, setClosing] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/trades/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setTrade(data);
        setLoading(false);
        if (data.status === "open") fetchQuote(data.ticker);
      });
  }, [id]);

  async function fetchQuote(ticker: string) {
    setQuoteLoading(true);
    try {
      const res = await fetch(`/api/market?ticker=${ticker}`);
      const data = await res.json();
      if (res.ok) setCurrentPrice(data.price);
    } finally {
      setQuoteLoading(false);
    }
  }

  async function closeTrade() {
    if (!exitPrice || !trade) return;
    setClosing(true);
    const res = await fetch(`/api/trades/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "closed",
        exitPrice: parseFloat(exitPrice),
      }),
    });
    const data = await res.json();
    if (res.ok) setTrade(data);
    setClosing(false);
  }

  async function deleteTrade() {
    if (!confirm("Delete this trade?")) return;
    await fetch(`/api/trades/${id}`, { method: "DELETE" });
    router.push("/trades");
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (!trade) return <p className="text-red-500">Trade not found.</p>;

  const pnl = calcRealizedPnl(trade);
  const unrealizedPnl =
    trade.status === "open" && currentPrice != null
      ? (trade.direction === "long"
          ? currentPrice - trade.entryPrice
          : trade.entryPrice - currentPrice) * trade.quantity
      : null;

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{trade.ticker}</h1>
            <Badge variant={trade.direction === "long" ? "default" : "destructive"} className="capitalize">
              {trade.direction}
            </Badge>
            <span
              className={`text-sm font-medium capitalize ${
                trade.status === "open" ? "text-blue-600" : "text-muted-foreground"
              }`}
            >
              {trade.status}
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1 capitalize">{trade.assetClass}</p>
        </div>
        <Button variant="destructive" size="sm" onClick={deleteTrade}>
          Delete
        </Button>
      </div>

      {/* Price Info */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Entry Price</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${trade.entryPrice.toFixed(2)}</p>
          </CardContent>
        </Card>
        {currentPrice != null && trade.status === "open" && (
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
                Current Price {quoteLoading && <span>(updating…)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">${currentPrice.toFixed(2)}</p>
            </CardContent>
          </Card>
        )}
        {trade.exitPrice != null && (
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Exit Price</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">${trade.exitPrice.toFixed(2)}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
              {pnl != null ? "Realized P&L" : "Unrealized P&L"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pnl != null ? (
              <p className={`text-2xl font-bold ${pnlColor(pnl)}`}>{formatPnl(pnl)}</p>
            ) : unrealizedPnl != null ? (
              <p className={`text-2xl font-bold ${pnlColor(unrealizedPnl)}`}>{formatPnl(unrealizedPnl)}</p>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Quantity</span>
            <span className="font-medium">{trade.quantity}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Position Size</span>
            <span className="font-medium">${(trade.entryPrice * trade.quantity).toFixed(2)}</span>
          </div>
          {trade.stopLoss != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stop Loss</span>
              <span className="font-medium text-red-600">${trade.stopLoss.toFixed(2)}</span>
            </div>
          )}
          {trade.takeProfit != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Take Profit</span>
              <span className="font-medium text-green-600">${trade.takeProfit.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Opened</span>
            <span className="font-medium">{new Date(trade.openedAt).toLocaleString()}</span>
          </div>
          {trade.closedAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Closed</span>
              <span className="font-medium">{new Date(trade.closedAt).toLocaleString()}</span>
            </div>
          )}
          {trade.notes && (
            <div className="pt-2 border-t">
              <p className="text-muted-foreground mb-1">Notes</p>
              <p className="whitespace-pre-wrap">{trade.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Close Trade */}
      {trade.status === "open" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Close Trade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="exitPrice">Exit Price ($)</Label>
              <div className="flex gap-2">
                <Input
                  id="exitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={currentPrice != null ? String(currentPrice) : "0.00"}
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                />
                {currentPrice != null && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setExitPrice(String(currentPrice))}
                  >
                    Use Market
                  </Button>
                )}
              </div>
            </div>
            <Button onClick={closeTrade} disabled={!exitPrice || closing}>
              {closing ? "Closing..." : "Close Trade"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
