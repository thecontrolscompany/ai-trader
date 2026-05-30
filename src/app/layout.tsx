import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Trader — Paper Trading Platform",
  description: "Evaluate AI trade signals against real market outcomes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-background text-foreground min-h-screen`}>
        <nav className="border-b px-6 py-3 flex items-center gap-6 text-sm font-medium">
          <Link href="/" className="text-base font-bold tracking-tight">
            AI Trader
          </Link>
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <Link href="/trades" className="text-muted-foreground hover:text-foreground transition-colors">
            Trades
          </Link>
          <Link href="/trades/new" className="text-muted-foreground hover:text-foreground transition-colors">
            + New Trade
          </Link>
        </nav>
        <main className="px-6 py-8 max-w-6xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
