"use client";

import { useEffect, useState } from "react";

interface MarketStatus {
  isOpen: boolean;
  label: string;       // "Market Open" | "Market Closed"
  nextLabel: string;   // "Closes in 1h 42m" | "Opens Mon 9:30 AM ET"
}

function getEasternTime(now = new Date()) {
  const str = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(str);
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// NYSE observed holidays — full market closes (YYYY-MM-DD in ET)
// Early closes (1 PM ET): day before Thanksgiving, July 3 when Jul 4 is Fri, Christmas Eve when Dec 25 is Fri
const HOLIDAYS = new Set([
  // 2025
  "2025-01-01", // New Year's Day
  "2025-01-20", // MLK Day
  "2025-02-17", // Presidents' Day
  "2025-04-18", // Good Friday
  "2025-05-26", // Memorial Day
  "2025-06-19", // Juneteenth
  "2025-07-04", // Independence Day
  "2025-09-01", // Labor Day
  "2025-11-27", // Thanksgiving
  "2025-12-25", // Christmas
  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Day
  "2026-02-16", // Presidents' Day
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day observed (Jul 4 is Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
  // 2027
  "2027-01-01", // New Year's Day
  "2027-01-18", // MLK Day
  "2027-02-15", // Presidents' Day
  "2027-03-26", // Good Friday
  "2027-05-31", // Memorial Day
  "2027-06-18", // Juneteenth observed (Jun 19 is Saturday)
  "2027-07-05", // Independence Day observed (Jul 4 is Sunday)
  "2027-09-06", // Labor Day
  "2027-11-25", // Thanksgiving
  "2027-12-24", // Christmas observed (Dec 25 is Saturday)
]);

// Early close days — market closes at 1:00 PM ET
const EARLY_CLOSE = new Set([
  "2025-07-03", // Day before July 4
  "2025-11-28", // Day after Thanksgiving (Black Friday)
  "2025-12-24", // Christmas Eve
  "2026-11-27", // Day after Thanksgiving
  "2026-12-24", // Christmas Eve (Dec 25 is Friday)
  "2027-11-26", // Day after Thanksgiving
]);

function toDateKey(et: Date): string {
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, "0");
  const d = String(et.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calcStatus(): MarketStatus {
  const now = new Date();
  const et  = getEasternTime(now);
  const day  = et.getDay();   // 0=Sun…6=Sat
  const hour = et.getHours();
  const min  = et.getMinutes();
  const totalMin = hour * 60 + min;

  const OPEN_MIN  = 9 * 60 + 30;   // 9:30 AM
  const dateKey   = toDateKey(et);
  const isHoliday = HOLIDAYS.has(dateKey);
  const closeMin  = EARLY_CLOSE.has(dateKey) ? 13 * 60 : 16 * 60; // 1 PM or 4 PM
  const isWeekday = day >= 1 && day <= 5;
  const isOpen    = isWeekday && !isHoliday && totalMin >= OPEN_MIN && totalMin < closeMin;

  if (isOpen) {
    const closeEt = new Date(et);
    closeEt.setHours(Math.floor(closeMin / 60), closeMin % 60, 0, 0);
    const diffMs   = closeEt.getTime() - et.getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return { isOpen: true, label: "Market Open", nextLabel: `Closes in ${timeStr}` };
  }

  // Find next trading day — skip weekends and holidays
  const nextOpen = new Date(et);
  nextOpen.setHours(9, 30, 0, 0);

  // If today is a weekday, not a holiday, and before open → opens today
  if (isWeekday && !isHoliday && totalMin < OPEN_MIN) {
    const diffMs   = nextOpen.getTime() - et.getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return { isOpen: false, label: isHoliday ? "Market Holiday" : "Market Closed", nextLabel: `Opens in ${timeStr}` };
  }

  // Advance to next trading day, skipping weekends + holidays
  for (let i = 1; i <= 10; i++) {
    nextOpen.setDate(nextOpen.getDate() + 1);
    const nd  = nextOpen.getDay();
    const nk  = toDateKey(nextOpen);
    if (nd >= 1 && nd <= 5 && !HOLIDAYS.has(nk)) break;
  }

  const openDay = DAY_NAMES[nextOpen.getDay()];
  const opens12 = nextOpen.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  });

  const earlyToday = EARLY_CLOSE.has(dateKey);
  return {
    isOpen: false,
    label: isHoliday ? "Market Holiday" : earlyToday ? "Early Close Today" : "Market Closed",
    nextLabel: `Opens ${openDay} ${opens12} ET`,
  };
}

export default function MarketStatusBar() {
  const [status, setStatus] = useState<MarketStatus>(() => calcStatus());

  useEffect(() => {
    // Refresh every 30 seconds
    const id = setInterval(() => setStatus(calcStatus()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`w-full flex items-center justify-center gap-3 py-1.5 text-xs font-medium border-b ${
      status.isOpen
        ? "bg-green-500/10 border-green-500/20 text-green-400"
        : "bg-muted/40 border-border text-muted-foreground"
    }`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${status.isOpen ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
      <span className="font-semibold">{status.label}</span>
      <span className="opacity-70">·</span>
      <span>{status.nextLabel}</span>
    </div>
  );
}
