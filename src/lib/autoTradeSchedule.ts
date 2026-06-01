export type EasternTime = {
  day: number;
  hour: number;
  minute: number;
};

export const RUN_WINDOWS: Record<string, Array<[number, number]>> = {
  "1x": [[9, 30]],
  "2x": [[9, 30], [13, 30]],
  "3x": [[9, 30], [11, 30], [13, 30]],
  "4x": [[9, 30], [11, 30], [13, 30], [15, 30]],
};

export function getEasternTime(now = new Date()): EasternTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    day: dayMap[values.weekday] ?? 0,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function isWithinRunWindow(freq: string, et: EasternTime): boolean {
  const windows = RUN_WINDOWS[freq] ?? RUN_WINDOWS["4x"];
  return windows.some(([hour, minute]) => et.hour === hour && et.minute === minute);
}

export function isMarketHours(et: EasternTime): boolean {
  const time = et.hour * 60 + et.minute;
  // Mon-Fri, 9:30 AM - 4:00 PM ET
  return et.day >= 1 && et.day <= 5 && time >= 570 && time <= 960;
}
