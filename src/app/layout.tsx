import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tim & Shane Stock — AI Paper Trading",
  description: "AI-powered paper trading platform",
};

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/stocks", label: "Top 100 Stocks" },
  { href: "/trades", label: "My Trades" },
  { href: "/trades/new", label: "+ New Trade" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-background text-foreground min-h-screen flex`}>

        {/* Sidebar */}
        <aside className="w-56 shrink-0 flex flex-col bg-sidebar border-r border-border min-h-screen sticky top-0">

          {/* Logo */}
          <div className="px-5 pt-6 pb-4 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Paper Trading</p>
            <h1 className="text-lg font-black leading-tight text-primary">
              Tim &amp; Shane<br />
              <span className="text-foreground">Stocks</span>
            </h1>
          </div>

          {/* Nav */}
          <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Photos */}
          <div className="flex items-end justify-between px-2 pb-0 mt-auto">
            <div className="w-[96px] overflow-hidden rounded-t-2xl opacity-90">
              <Image
                src="/tim.png"
                alt="Tim"
                width={96}
                height={128}
                className="object-cover object-top w-full"
              />
            </div>
            <div className="w-[96px] overflow-hidden rounded-t-2xl opacity-90">
              <Image
                src="/shane.png"
                alt="Shane"
                width={96}
                height={128}
                className="object-cover object-top w-full"
              />
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 px-8 py-8">{children}</main>
        </div>

      </body>
    </html>
  );
}
