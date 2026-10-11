import { describe, expect, it } from 'vitest';
import { addWorkingMinutes, addCalendarPeriod, localParts, zonedToUtc, nextOpening, type Schedule } from '../../shared/schedule';

const TZ = 'Africa/Cairo';
// Sun–Thu 10:00–14:00 and 15:00–19:00 (break 14–15), Sat 12:00–16:00, Fri closed.
const sched: Schedule = {
  timezone: TZ,
  week: {
    '0': [{ start: '10:00', end: '14:00' }, { start: '15:00', end: '19:00' }],
    '1': [{ start: '10:00', end: '14:00' }, { start: '15:00', end: '19:00' }],
    '2': [{ start: '10:00', end: '14:00' }, { start: '15:00', end: '19:00' }],
    '3': [{ start: '10:00', end: '14:00' }, { start: '15:00', end: '19:00' }],
    '4': [{ start: '10:00', end: '14:00' }, { start: '15:00', end: '19:00' }],
    '6': [{ start: '12:00', end: '16:00' }],
  },
  holidays: [{ date: '2026-10-06', label: 'Armed Forces Day' }],
};
const local = (t: number | null) => {
  const p = localParts(t!, TZ);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')} ${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
};
const at = (y: number, m: number, d: number, hh: number, mm = 0) => zonedToUtc(y, m, d, hh, mm, TZ);

describe('Cairo timezone conversion', () => {
  it('uses +03:00 in summer (DST) and +02:00 in winter', () => {
    expect(new Date(at(2026, 7, 1, 12)).toISOString()).toBe('2026-07-01T09:00:00.000Z');
    expect(new Date(at(2026, 12, 1, 12)).toISOString()).toBe('2026-12-01T10:00:00.000Z');
  });
  it('resolves the fall-back hour (last Thursday of Oct 2026) to the earlier instant', () => {
    const t = at(2026, 10, 29, 23, 30);
    expect(local(t)).toBe('2026-10-29 23:30');
    expect(local(t + 3_600_000)).toBe('2026-10-29 23:30'); // same wall time repeats one hour later
  });
  it('shifts non-existent spring-forward times (last Friday of Apr 2026, 00:00→01:00) forward', () => {
    const t = at(2026, 4, 24, 0, 30);
    expect(local(t)).toBe('2026-04-24 01:30');
  });
});

describe('delivery deadline = 2 working hours', () => {
  it('within the same open interval', () => {
    expect(local(addWorkingMinutes(at(2026, 10, 11, 10, 30), 120, sched))).toBe('2026-10-11 12:30');
  });
  it('skips the lunch break', () => {
    expect(local(addWorkingMinutes(at(2026, 10, 11, 13, 0), 120, sched))).toBe('2026-10-11 16:00');
  });
  it('carries over closing time to next working day', () => {
    // Sunday 18:30 → 30 min Sunday, 90 min Monday from 10:00 → 11:30
    expect(local(addWorkingMinutes(at(2026, 10, 11, 18, 30), 120, sched))).toBe('2026-10-12 11:30');
  });
  it('approval outside hours starts counting at next opening', () => {
    expect(local(addWorkingMinutes(at(2026, 10, 11, 23, 0), 120, sched))).toBe('2026-10-12 12:00');
  });
  it('skips Friday (closed) and uses Saturday hours', () => {
    // Thursday 2026-10-08 18:00 → 1h Thu, then Fri closed, Sat 12:00 + 1h = 13:00
    expect(local(addWorkingMinutes(at(2026, 10, 8, 18, 0), 120, sched))).toBe('2026-10-10 13:00');
  });
  it('skips configured holidays', () => {
    // Monday 2026-10-05 18:00 → 1h Mon; Tue 10-06 holiday; Wed 10:00 + 1h = 11:00
    expect(local(addWorkingMinutes(at(2026, 10, 5, 18, 0), 120, sched))).toBe('2026-10-07 11:00');
  });
  it('holiday with special hours overrides the weekday', () => {
    const s: Schedule = { ...sched, holidays: [{ date: '2026-10-06', intervals: [{ start: '12:00', end: '13:00' }] }] };
    expect(local(addWorkingMinutes(at(2026, 10, 5, 18, 0), 120, s))).toBe('2026-10-06 13:00');
  });
  it('counts real elapsed time across the DST fall-back night', () => {
    const night: Schedule = { timezone: TZ, week: { '4': [{ start: '22:00', end: '24:00' }], '5': [{ start: '10:00', end: '12:00' }] }, holidays: [] };
    // Thu 2026-10-29 22:00 local (+03) → 24:00 local (+02) is 3 real hours, so 2h ends at the second 23:00
    const due = addWorkingMinutes(at(2026, 10, 29, 22, 0), 120, night)!;
    expect(due - at(2026, 10, 29, 22, 0)).toBe(2 * 3_600_000);
    expect(new Date(due).toISOString()).toBe('2026-10-29T21:00:00.000Z');
    expect(local(due)).toBe('2026-10-29 23:00');
  });
  it('counts real elapsed time across the DST spring-forward night', () => {
    const night: Schedule = { timezone: TZ, week: { '4': [{ start: '23:00', end: '24:00' }], '5': [{ start: '01:00', end: '03:00' }] }, holidays: [] };
    // Thu 2026-04-23 23:00 (+02) → 1h until the jump, then Fri from 01:00 (+03): 1h → 02:00
    expect(local(addWorkingMinutes(at(2026, 4, 23, 23, 0), 120, night))).toBe('2026-04-24 02:00');
  });
  it('returns null when no working hours are configured', () => {
    expect(addWorkingMinutes(Date.now(), 120, { timezone: TZ, week: {}, holidays: [] })).toBeNull();
  });
  it('nextOpening finds the next interval', () => {
    expect(local(nextOpening(at(2026, 10, 9, 9, 0), sched))).toBe('2026-10-10 12:00'); // Friday → Saturday
  });
});

describe('subscription expiry', () => {
  it('adds calendar months in Cairo time, clamping month ends', () => {
    expect(local(addCalendarPeriod(at(2026, 1, 31, 15, 0), 1, 'month', TZ))).toBe('2026-02-28 15:00');
    expect(local(addCalendarPeriod(at(2026, 10, 10, 15, 0), 12, 'month', TZ))).toBe('2027-10-10 15:00');
    expect(local(addCalendarPeriod(at(2026, 10, 10, 15, 0), 30, 'day', TZ))).toBe('2026-11-09 15:00');
  });
});
