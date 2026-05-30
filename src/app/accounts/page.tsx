"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Account {
  id: string;
  name: string;
  type: "bank" | "brokerage";
  balance: number;
  createdAt: string;
}

interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

const BANK_ID = "00000000-0000-0000-0000-000000000001";
const BROKERAGE_ID = "00000000-0000-0000-0000-000000000002";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/accounts");
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setTransfers(data.transfers ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function act(action: string, extra?: object) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, amount: parseFloat(amount), note: note || undefined, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
    } else {
      setSuccess("Done!");
      setAmount("");
      setNote("");
      await load();
    }
    setBusy(false);
  }

  const bank = accounts.find((a) => a.type === "bank");
  const brokerage = accounts.find((a) => a.type === "brokerage");
  const total = (bank?.balance ?? 0) + (brokerage?.balance ?? 0);

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Accounts</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your paper trading cash.</p>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="sm:col-span-1">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">🏦 Bank Account</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">{loading ? "…" : fmt(bank?.balance ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-1">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">📈 Brokerage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">{loading ? "…" : fmt(brokerage?.balance ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-1 border-primary/30">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-primary uppercase tracking-wide font-semibold">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-primary">{loading ? "…" : fmt(total)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Action form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Move Money</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Amount ($)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. Initial deposit"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => act("deposit")}
              disabled={busy || !amount}
              className="rounded-xl bg-primary text-primary-foreground py-2.5 px-4 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              + Deposit to Bank
            </button>
            <button
              onClick={() => act("transfer", { direction: "to_brokerage" })}
              disabled={busy || !amount}
              className="rounded-xl border border-border py-2.5 px-4 text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-50"
            >
              Bank → Brokerage
            </button>
            <button
              onClick={() => act("transfer", { direction: "to_bank" })}
              disabled={busy || !amount}
              className="rounded-xl border border-border py-2.5 px-4 text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-50"
            >
              Brokerage → Bank
            </button>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-green-400">{success}</p>}
        </CardContent>
      </Card>

      {/* Transfer history */}
      <div>
        <h2 className="text-base font-semibold mb-3">Transaction History</h2>
        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wide text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfers.map((t) => {
                  const isTrade = t.note?.startsWith("Trade");
                  const isDeposit = t.fromAccountId === t.toAccountId && t.fromAccountId === BANK_ID;
                  const isToBank = t.toAccountId === BANK_ID && t.fromAccountId === BROKERAGE_ID;
                  const amtColor = isDeposit || isToBank || t.note?.includes("closed") ? "text-green-400" : "text-muted-foreground";
                  return (
                    <tr key={t.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleDateString()} {new Date(t.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2.5">{t.note ?? "—"}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${amtColor}`}>
                        {fmt(t.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
