"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props { isLoggedIn: boolean; }

interface Props { isLoggedIn: boolean; isAdmin?: boolean; }

const publicTabs = [
  { href: "/",        label: "Markets",  icon: "📈" },
];

const adminTabs = [
  { href: "/scan",        label: "AI Scan",   icon: "🤖" },
  { href: "/accounts",    label: "Portfolio", icon: "💼" },
  { href: "/portfolios",  label: "Compare",   icon: "📊" },
  { href: "/trades",      label: "Trades",    icon: "📋" },
];

const userTabs = [
  { href: "/accounts",    label: "Portfolio", icon: "💼" },
  { href: "/portfolios",  label: "Compare",   icon: "📊" },
  { href: "/trades",      label: "Trades",    icon: "📋" },
];

export default function BottomNav({ isLoggedIn, isAdmin = false }: Props) {
  const pathname = usePathname();
  const privateTabs = isAdmin ? adminTabs : userTabs;
  const tabs = isLoggedIn ? [...publicTabs, ...privateTabs] : publicTabs;

  function isActive(href: string) {
    if (href === "/") return pathname === "/" || pathname === "/stocks";
    return pathname.startsWith(href);
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-border">
      <div className="flex items-stretch h-16">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
              isActive(t.href) ? "text-primary" : "text-muted-foreground"
            }`}>
            <span className="text-lg leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        ))}
        {!isLoggedIn && (
          <Link href="/login"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground">
            <span className="text-lg leading-none">🔑</span>
            <span>Sign In</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
