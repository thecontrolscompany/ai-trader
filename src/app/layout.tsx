import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tim & Shane Stocks — AI Paper Trading",
  description: "AI-powered paper trading platform",
};

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/stocks", label: "Top 100" },
  { href: "/scan", label: "AI Scan" },
  { href: "/trades", label: "My Trades" },
  { href: "/trades/new", label: "+ New Trade" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-background text-foreground min-h-screen`}>

        {/* Header */}
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
          <div className="max-w-6xl mx-auto px-4 flex items-center gap-4 h-14">

            {/* Portraits */}
            <div className="flex items-end gap-1 shrink-0">
              <div className="w-9 h-12 rounded-t-xl overflow-hidden">
                <Image src="/tim.png" alt="Tim" width={36} height={48} className="object-cover object-top w-full h-full" />
              </div>
              <div className="w-9 h-12 rounded-t-xl overflow-hidden">
                <Image src="/shane.png" alt="Shane" width={36} height={48} className="object-cover object-top w-full h-full" />
              </div>
            </div>

            {/* Brand */}
            <Link href="/" className="shrink-0">
              <span className="font-black text-primary text-base leading-none">Tim &amp; Shane</span>
              <span className="font-black text-foreground text-base leading-none"> Stocks</span>
            </Link>

            {/* Nav — scrollable on mobile */}
            <nav className="flex items-center gap-1 ml-auto overflow-x-auto scrollbar-hide">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors whitespace-nowrap"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main className="max-w-6xl mx-auto px-4 py-6">
          {children}
        </main>

      </body>
    </html>
  );
}
