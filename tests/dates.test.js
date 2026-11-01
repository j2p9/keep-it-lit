import { afterAll, describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  endOfMonth,
  hoursLeft,
  startOfWeek,
  todayKey,
} from '../src/lib/dates.js';

describe('dates', () => {
  it('steps across month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-01', '2026-12-01')).toBe(30);
  });

  it('finds week and month edges', () => {
    // 2026-11-04 is a Wednesday.
    expect(startOfWeek('2026-11-04', 0)).toBe('2026-11-01');
    expect(startOfWeek('2026-11-04', 1)).toBe('2026-11-02');
    expect(startOfWeek('2026-11-01', 1)).toBe('2026-10-26');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(daysInMonth('2026-11-15')).toBe(30);
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
  });

  it('counts late-night check-offs toward the previous day when the day ends later', () => {
    const lateNight = new Date(2026, 10, 3, 1, 30);
    expect(todayKey(lateNight, 0)).toBe('2026-11-03');
    expect(todayKey(lateNight, 2)).toBe('2026-11-02');
    expect(hoursLeft(new Date(2026, 10, 2, 21, 0), 0)).toBeCloseTo(3);
    expect(hoursLeft(lateNight, 2)).toBeCloseTo(0.5);
  });
});

describe('dates across daylight saving', () => {
  const original = process.env.TZ;
  process.env.TZ = 'America/New_York';
  afterAll(() => {
    process.env.TZ = original;
  });

  it('never skips or repeats a day when clocks change', () => {
    // US clocks spring forward on 2026-03-08 and fall back on 2026-11-01.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(daysBetween('2026-03-07', '2026-03-10')).toBe(3);
    expect(daysBetween('2026-10-31', '2026-11-03')).toBe(3);
  });
});
