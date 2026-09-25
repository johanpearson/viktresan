import { describe, expect, it } from 'vitest';
import {
  buildDayIndex,
  formatMonth,
  monthGrid,
  monthOf,
  shiftMonth,
  weekdayIndex,
} from './calendar.ts';

describe('månader', () => {
  it('monthOf och shiftMonth över årsskiften', () => {
    expect(monthOf('2026-09-25')).toBe('2026-09');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-09', -21)).toBe('2024-12');
  });

  it('veckodag med måndag först', () => {
    expect(weekdayIndex('2026-09-21')).toBe(0); // måndag
    expect(weekdayIndex('2026-09-27')).toBe(6); // söndag
    expect(weekdayIndex('1969-12-29')).toBe(0);
  });

  it('rutnätet börjar på måndag och har hela veckor', () => {
    // September 2026 börjar på en tisdag och har 30 dagar.
    const weeks = monthGrid('2026-09');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([
      null,
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter((d) => d != null)).toHaveLength(30);
    expect(weeks[4]?.slice(0, 3)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
  });

  it('februari under skottår', () => {
    expect(
      monthGrid('2028-02')
        .flat()
        .filter((d) => d != null),
    ).toHaveLength(29);
  });

  it('månadsnamn på svenska', () => {
    expect(formatMonth('2026-09')).toBe('september 2026');
  });
});

describe('buildDayIndex', () => {
  it('samlar vikt (dagsmedel), midja, steg, kcal och antal bilder per dag', () => {
    const index = buildDayIndex({
      weights: [
        { date: '2026-09-01', weightKg: 80 },
        { date: '2026-09-01', weightKg: 81 },
      ],
      waist: [{ date: '2026-09-02', waistCm: 90 }],
      steps: [{ date: '2026-09-01', steps: 5000, createdAt: 1 }],
      foodLog: [
        { date: '2026-09-01', grams: 200, per100: { kcal: 100, proteinG: 0, carbsG: 0, fatG: 0 } },
      ],
      photoDates: ['2026-09-02', '2026-09-02'],
    });
    expect(index.get('2026-09-01')).toEqual({ weightKg: 80.5, steps: 5000, kcal: 200 });
    expect(index.get('2026-09-02')).toEqual({ waistCm: 90, photos: 2 });
    expect(index.has('2026-09-03')).toBe(false);
  });
});
