import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  fromDayNumber,
  isIsoDate,
  toChartSeconds,
  toDayNumber,
  todayIso,
} from './dates.ts';

describe('dates', () => {
  it('todayIso använder lokal tid', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('validerar ISO-datum', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-2-1')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('räknar dagar över sommartidsomställning och årsskifte', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-01-10', '2026-01-01')).toBe(-9);
  });

  it('addDays och fromDayNumber är konsekventa', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(fromDayNumber(toDayNumber('2026-09-25'))).toBe('2026-09-25');
  });

  it('kastar för ogiltiga datum', () => {
    expect(() => toDayNumber('igår')).toThrow(RangeError);
  });

  it('ger stigande sekunder för grafens tidsaxel', () => {
    expect(toChartSeconds('2026-01-02') - toChartSeconds('2026-01-01')).toBe(86_400);
  });
});
