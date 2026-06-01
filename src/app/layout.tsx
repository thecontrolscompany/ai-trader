import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { auth } from "@/auth";
import { getActivePortfolio } from "@/lib/portfolio";
import BottomNav from "@/components/BottomNav";
import MarketStatusBar from "@/components/MarketStatusBar";
import NavBar from "@/components/NavBar";
import TickerBar from "@/components/TickerBar";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tim & Shane Stocks — AI Paper Trading",
  description: "AI-powered paper trading platform",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isLoggedIn = !!session?.user;
  const portfolio = isLoggedIn ? await getActivePortfolio() : null;

  return (
    <html lang="en">
      <body className={`${geist.className} bg-background text-foreground min-h-screen`}>
        <TickerBar />
        <MarketStatusBar />
        <NavBar
          isLoggedIn={isLoggedIn}
          userName={session?.user?.name}
          userImage={session?.user?.image}
          activePortfolioId={portfolio?.id ?? null}
          portfolioName={portfolio?.name ?? null}
          portfolioMode={portfolio?.mode ?? null}
        />
        <main className="max-w-6xl mx-auto px-4 py-6 pb-20 md:pb-6">
          {children}
        </main>
        <BottomNav isLoggedIn={isLoggedIn} />
      </body>
    </html>
  );
}
