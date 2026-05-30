import { fetchTopStocks } from "@/lib/fetchStocks";
import { NextResponse } from "next/server";

export interface StockRow {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
  pe: number | null;
  eps: number | null;
  beta: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  dividendYield: number | null;
}

export async function GET() {
  try {
    const rows = await fetchTopStocks();
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Failed to fetch stock data" }, { status: 500 });
  }
}
