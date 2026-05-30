"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/stocks", label: "Top 100" },
  { href: "/scan", label: "AI Scan" },
  { href: "/trades", label: "My Trades" },
  { href: "/trades/new", label: "+ New Trade" },
];

interface Props {
  userName?: string | null;
  userImage?: string | null;
}

export default function NavBar({ userName, userImage }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const firstName = userName?.split(" ")[0] ?? null;

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-3 h-14">

        {/* Portraits */}
        <div className="flex items-end gap-1 shrink-0">
          <div className="w-8 h-11 rounded-t-xl overflow-hidden">
            <Image src="/tim.png" alt="Tim" width={32} height={44} className="object-cover object-top w-full h-full" />
          </div>
          <div className="w-8 h-11 rounded-t-xl overflow-hidden">
            <Image src="/shane.png" alt="Shane" width={32} height={44} className="object-cover object-top w-full h-full" />
          </div>
        </div>

        {/* Brand */}
        <Link href="/" className="shrink-0 leading-none" onClick={() => setOpen(false)}>
          <span className="font-black text-primary text-sm sm:text-base">Tim &amp; Shane</span>
          <span className="font-black text-foreground text-sm sm:text-base"> Stocks</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 ml-auto">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive(l.href)
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {l.label}
            </Link>
          ))}

          {/* User + sign out */}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
            {userImage && (
              <img src={userImage} alt={userName ?? ""} className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
            )}
            {firstName && <span className="text-sm text-muted-foreground">{firstName}</span>}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-xs px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Sign out
            </button>
          </div>
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="md:hidden ml-auto flex flex-col justify-center items-center w-9 h-9 rounded-lg hover:bg-accent transition-colors gap-1.5"
          aria-label="Menu"
        >
          <span className={`block w-5 h-0.5 bg-foreground rounded transition-all duration-200 ${open ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`block w-5 h-0.5 bg-foreground rounded transition-all duration-200 ${open ? "opacity-0" : ""}`} />
          <span className={`block w-5 h-0.5 bg-foreground rounded transition-all duration-200 ${open ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-border bg-background px-4 py-3 flex flex-col gap-1">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                isActive(l.href)
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="px-4 py-3 rounded-xl text-sm font-semibold text-left text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Sign out {firstName ? `(${firstName})` : ""}
          </button>
        </div>
      )}
    </header>
  );
}
