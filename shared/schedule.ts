// Working-hours engine using the IANA zone (default Africa/Cairo).
// All instants are UTC epoch milliseconds; local wall-clock times are converted with
// Intl so DST transitions (Egypt switches at local midnight) are handled correctly.

export type Interval = { start: string; end: string }; // "HH:MM", end may be "24:00"
export type Holiday = { date: string; label?: string; intervals?: Interval[] }; // no intervals => closed all day
export type Schedule = {
  timezone: string;
  /** 0 = Sunday … 6 = Saturday */
  week: Record<string, Interval[]>;
  holidays: Holiday[];
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export type LocalParts = { y: number; m: number; d: number; hh: number; mm: number; ss: number; weekday: number };
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(instant: number, tz: string): LocalParts {
  const parts = dtf(tz).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    y: Number(get('year')), m: Number(get('month')), d: Number(get('day')),
    hh: Number(get('hour')) % 24, mm: Number(get('minute')), ss: Number(get('second')),
    weekday: WD[get('weekday')] ?? 0,
  };
}

/** Offset (ms) of the zone at a given instant: local - UTC. */
export function tzOffset(instant: number, tz: string): number {
  const p = localParts(instant, tz);
  const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return asUTC - Math.floor(instant / 1000) * 1000;
}

/**
 * Convert a local wall-clock time to a UTC instant.
 * Ambiguous times (fall-back overlap) resolve to the earlier occurrence.
 * Non-existent times (spring-forward gap) shift forward by the gap length (Temporal "compatible").
 */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsets = [...new Set([tzOffset(guess - 86_400_000, tz), tzOffset(guess, tz), tzOffset(guess + 86_400_000, tz)])];
  const matches: number[] = [];
  for (const o of offsets) {
    const t = guess - o;
    const p = localParts(t, tz);
    if (p.y === y && p.m === m && p.d === d && p.hh === hh && p.mm === mm) matches.push(t);
  }
  if (matches.length) return Math.min(...matches);
  return guess - Math.min(...offsets);
}

function parseHM(s: string): [number, number] {
  const [h, m] = s.split(':').map(Number);
  return [h, m];
}

export function isValidInterval(iv: Interval): boolean {
  if (!/^([01]\d|2[0-4]):[0-5]\d$/.test(iv.start) || !/^([01]\d|2[0-4]):[0-5]\d$/.test(iv.end)) return false;
  const [sh, sm] = parseHM(iv.start), [eh, em] = parseHM(iv.end);
  if (sh === 24 && sm > 0) return false;
  if (eh === 24 && em > 0) return false;
  return sh * 60 + sm < eh * 60 + em;
}

function addDays(y: number, m: number, d: number, n: number): [number, number, number] {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

export function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Intervals (as UTC instants) for a given local calendar date. */
export function intervalsForDate(s: Schedule, y: number, m: number, d: number): Array<[number, number]> {
  const key = ymd(y, m, d);
  const holiday = s.holidays.find((h) => h.date === key);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const list = holiday ? holiday.intervals ?? [] : s.week[String(weekday)] ?? [];
  const out: Array<[number, number]> = [];
  for (const iv of list) {
    if (!isValidInterval(iv)) continue;
    const [sh, sm] = parseHM(iv.start), [eh, em] = parseHM(iv.end);
    const start = zonedToUtc(y, m, d, sh, sm, s.timezone);
    let end: number;
    if (eh === 24) {
      const [ny, nm, nd] = addDays(y, m, d, 1);
      end = zonedToUtc(ny, nm, nd, 0, 0, s.timezone);
    } else end = zonedToUtc(y, m, d, eh, em, s.timezone);
    if (end > start) out.push([start, end]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export function hasAnyOpenHours(s: Schedule): boolean {
  return Object.values(s.week ?? {}).some((ivs) => (ivs ?? []).some(isValidInterval));
}

/** Add working minutes to an instant, skipping closed periods. Returns null if no open hours within ~13 months. */
export function addWorkingMinutes(startUtc: number, minutes: number, s: Schedule): number | null {
  if (!hasAnyOpenHours(s) && !s.holidays.some((h) => (h.intervals ?? []).length)) return null;
  let remaining = Math.round(minutes * 60_000);
  let cursor = startUtc;
  const p = localParts(startUtc, s.timezone);
  // Start one day earlier so an interval that began yesterday and runs past midnight ("24:00") is considered.
  for (let i = -1; i < 400; i++) {
    const [y, m, d] = addDays(p.y, p.m, p.d, i);
    for (const [a, b] of intervalsForDate(s, y, m, d)) {
      if (b <= cursor) continue;
      const from = Math.max(a, cursor);
      const avail = b - from;
      if (avail >= remaining) return from + remaining;
      remaining -= avail;
      cursor = b;
    }
  }
  return null;
}

/** Next instant (>= t) when the business is open, or null. */
export function nextOpening(t: number, s: Schedule): number | null {
  const p = localParts(t, s.timezone);
  for (let i = -1; i < 400; i++) {
    const [y, m, d] = addDays(p.y, p.m, p.d, i);
    for (const [a, b] of intervalsForDate(s, y, m, d)) {
      if (b <= t) continue;
      return Math.max(a, t);
    }
  }
  return null;
}

export function isOpenAt(t: number, s: Schedule): boolean {
  const n = nextOpening(t, s);
  return n !== null && n === t;
}

/** Add calendar months/days/years in the business timezone (for subscription expiry). */
export function addCalendarPeriod(startUtc: number, value: number, unit: 'day' | 'month' | 'year', tz: string): number {
  const p = localParts(startUtc, tz);
  let y = p.y, m = p.m, d = p.d;
  if (unit === 'day') [y, m, d] = addDays(y, m, d, value);
  else {
    const months = unit === 'year' ? value * 12 : value;
    const total = (y * 12 + (m - 1)) + months;
    const ny = Math.floor(total / 12), nm = (total % 12) + 1;
    const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    y = ny; m = nm; d = Math.min(d, lastDay);
  }
  return zonedToUtc(y, m, d, p.hh, p.mm, tz);
}

export function formatInZone(instant: number, lang: 'ar' | 'en', tz = 'Africa/Cairo', withTime = true): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    timeZone: tz, weekday: withTime ? 'short' : undefined, year: 'numeric', month: 'short', day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit', hour12: true } : {}),
  }).format(new Date(instant));
}

export const EMPTY_SCHEDULE: Schedule = { timezone: 'Africa/Cairo', week: {}, holidays: [] };
