// Wall-clock and time-zone math. Pure: no DOM, no chrome.*.
//
// A "wall" time is "YYYY-MM-DDTHH:MM" with no zone. It is what the Calendar
// grid shows. It gets a zone only when we build the API request (toRfc3339),
// using the calendar's own zone (read from the Calendar API, never hardcoded).

export const DAY_MINUTES = 24 * 60;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export interface WallParts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
}

export function parseDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function parseWall(wall: string): WallParts | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(wall);
  if (!match) return null;
  const date = parseDate(match[1]!);
  const h = Number(match[2]);
  const mi = Number(match[3]);
  if (!date || h > 23 || mi > 59) return null;
  return { ...date, h, mi };
}

function fromUtcMs(ms: number): string {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

function wallAsUtcMs(p: WallParts): number {
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
}

export function addDays(iso: string, days: number): string {
  const p = parseDate(iso);
  if (!p) throw new Error(`Invalid date: ${iso}`);
  return fromUtcMs(Date.UTC(p.y, p.m - 1, p.d + days)).slice(0, 10);
}

/** Date + minutes since midnight → wall time (minutes ≥ 1440 roll into the next day). */
export function toWall(date: string, minutes: number): string {
  const p = parseDate(date);
  if (!p) throw new Error(`Invalid date: ${date}`);
  return fromUtcMs(Date.UTC(p.y, p.m - 1, p.d, 0, minutes));
}

/** Calendar arithmetic on wall time (no zone, so no DST: 9:00 + 60m is always 10:00). */
export function addMinutes(wall: string, minutes: number): string {
  const p = parseWall(wall);
  if (!p) throw new Error(`Invalid wall time: ${wall}`);
  return fromUtcMs(wallAsUtcMs(p) + minutes * 60_000);
}

/** Minutes from wall time `a` to wall time `b`. */
export function wallDiffMinutes(a: string, b: string): number {
  const pa = parseWall(a);
  const pb = parseWall(b);
  if (!pa || !pb) return NaN;
  return (wallAsUtcMs(pb) - wallAsUtcMs(pa)) / 60_000;
}

export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
function offsetFormatter(zone: string): Intl.DateTimeFormat {
  let fmt = offsetFormatters.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(zone, fmt);
  }
  return fmt;
}

/** UTC offset of `zone` at instant `utcMs`, in minutes (New York in winter → -300). */
export function zoneOffsetMinutes(zone: string, utcMs: number): number {
  const parts: Record<string, number> = {};
  for (const part of offsetFormatter(zone).formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour! % 24, parts.minute!, parts.second!);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/**
 * Instant for a wall time in `zone`.
 *  - Ambiguous times (DST fall-back, e.g. 1:30 twice) resolve to the earlier one.
 *  - Skipped times (DST spring-forward, e.g. 2:30) resolve forward (→ 3:30),
 *    like Temporal's "compatible" disambiguation.
 */
export function wallToUtcMs(wall: string, zone: string): number {
  const p = parseWall(wall);
  if (!p) throw new Error(`Invalid wall time: ${wall}`);
  const naive = wallAsUtcMs(p);
  const before = zoneOffsetMinutes(zone, naive - 36 * 3600_000);
  const after = zoneOffsetMinutes(zone, naive + 36 * 3600_000);
  if (before === after) return naive - before * 60_000; // no transition nearby (the common case)
  const withBefore = naive - before * 60_000;
  const withAfter = naive - after * 60_000;
  const validBefore = zoneOffsetMinutes(zone, withBefore) === before;
  const validAfter = zoneOffsetMinutes(zone, withAfter) === after;
  if (validBefore && validAfter) return Math.min(withBefore, withAfter); // overlap → earlier
  if (validBefore) return withBefore;
  if (validAfter) return withAfter;
  return withBefore; // gap → keep the pre-transition offset, which lands after the gap
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** RFC 3339 with an explicit offset, e.g. "2026-11-19T14:00:00-05:00". */
export function toRfc3339(wall: string, zone: string): string {
  const instant = wallToUtcMs(wall, zone);
  const offset = zoneOffsetMinutes(zone, instant);
  const local = fromUtcMs(instant + offset * 60_000); // re-derive: a skipped time moves forward
  return `${local}:00${formatOffset(offset)}`;
}

function utcFormatter(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
}

/** "Thu, Nov 19" */
export function formatDayLabel(iso: string, locale?: string): string {
  const p = parseDate(iso);
  if (!p) return iso;
  return utcFormatter(locale, { weekday: "short", month: "short", day: "numeric" }).format(Date.UTC(p.y, p.m - 1, p.d));
}

/** "Thu, Nov 19 · 2:00 – 2:45 PM" (crossing midnight shows both dates). */
export function formatSlotLabel(date: string, minutes: number, duration: number, locale?: string): string {
  const p = parseDate(date);
  if (!p) return date;
  const from = Date.UTC(p.y, p.m - 1, p.d, 0, minutes);
  const to = from + duration * 60_000;
  const sameDay = new Date(from).getUTCDate() === new Date(to - 1).getUTCDate() && duration <= DAY_MINUTES;
  if (sameDay) {
    const range = utcFormatter(locale, { hour: "numeric", minute: "2-digit" }).formatRange(from, to);
    return `${formatDayLabel(date, locale)} · ${range}`;
  }
  return utcFormatter(locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).formatRange(from, to);
}
