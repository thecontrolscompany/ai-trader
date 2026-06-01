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

function calcStatus(): MarketStatus {
  const now = new Date();
  const et  = getEasternTime(now);
  const day  = et.getDay();   // 0=Sun…6=Sat
  const hour = et.getHours();
  const min  = et.getMinutes();
  const totalMin = hour * 60 + min;

  const OPEN_MIN  = 9 * 60 + 30;   // 9:30 AM
  const CLOSE_MIN = 16 * 60;        // 4:00 PM
  const isWeekday = day >= 1 && day <= 5;
  const isOpen    = isWeekday && totalMin >= OPEN_MIN && totalMin < CLOSE_MIN;

  if (isOpen) {
    // Time until 4:00 PM ET today
    const closeEt = new Date(et);
    closeEt.setHours(16, 0, 0, 0);
    const diffMs   = closeEt.getTime() - et.getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return { isOpen: true, label: "Market Open", nextLabel: `Closes in ${timeStr}` };
  }

  // Find next weekday 9:30 AM ET
  const nextOpen = new Date(et);
  nextOpen.setSeconds(0, 0);
  nextOpen.setHours(9, 30);

  // If today is a weekday and before open, next open is today
  if (isWeekday && totalMin < OPEN_MIN) {
    const diffMs   = nextOpen.getTime() - et.getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return { isOpen: false, label: "Market Closed", nextLabel: `Opens in ${timeStr}` };
  }

  // Otherwise move to next weekday
  let daysAhead = 1;
  const nextDay = (day + 1) % 7;
  if (nextDay === 6) daysAhead = 2;       // Sat → Mon (+2)
  if (nextDay === 0) daysAhead = 2;       // Sun → Mon (+1 more = 2)
  if (day === 5 && totalMin >= CLOSE_MIN) daysAhead = 3; // Fri after close → Mon
  if (day === 6) daysAhead = 2;           // Sat → Mon
  if (day === 0) daysAhead = 1;           // Sun → Mon

  nextOpen.setDate(nextOpen.getDate() + daysAhead);
  const openDay = DAY_NAMES[nextOpen.getDay()];
  const opens12 = nextOpen.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  });

  return {
    isOpen: false,
    label: "Market Closed",
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
