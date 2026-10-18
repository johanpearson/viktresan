import { describe, expect, it } from 'vitest';
import type { FoodLogEntry } from '../db/db.ts';
import { defaultMealSlots } from './mealSlots.ts';
import {
  missedDayText,
  missedFoodDays,
  usualDay,
  usualEntries,
  usualKcal,
  withSkipped,
} from './missedDays.ts';
import { dailyIntake } from './nutrition.ts';

const SLOTS = defaultMealSlots();

// 2026-10-18 är en söndag.
const TODAY = '2026-10-18';

function entry(date: string, meal: string, kcal: number, proteinG = 0): FoodLogEntry {
  return {
    id: `${date}:${meal}`,
    date,
    meal,
    foodId: 'lv:1',
    name: 'Mat',
    amount: 100,
    unit: 'g',
    grams: 100,
    per100: { kcal, proteinG, carbsG: 0, fatG: 0 },
    createdAt: 1,
  };
}

describe('missedFoodDays', () => {
  it('dagar utan matlogg de senaste 7 dagarna, senast först', () => {
    const log = ['2026-10-10', '2026-10-12', '2026-10-13', '2026-10-15', '2026-10-18'].map((d) =>
      entry(d, 'lunch', 500),
    );
    // Fönstret är 11–17 okt; 10 okt ligger utanför.
    expect(missedFoodDays(log, TODAY, [])).toEqual([
      '2026-10-17',
      '2026-10-16',
      '2026-10-14',
      '2026-10-11',
    ]);
  });

  it('inte före första loggade dagen, inte hoppade dagar', () => {
    const log = [entry('2026-10-15', 'lunch', 500)];
    expect(missedFoodDays(log, TODAY, [])).toEqual(['2026-10-17', '2026-10-16']);
    expect(missedFoodDays(log, TODAY, ['2026-10-17'])).toEqual(['2026-10-16']);
  });

  it('ingenting när Mat inte används (ingen logg, eller inget på två veckor)', () => {
    expect(missedFoodDays([], TODAY, [])).toEqual([]);
    expect(missedFoodDays([entry('2026-09-01', 'lunch', 500)], TODAY, [])).toEqual([]);
  });

  it('hoppade dagar sparas bara två veckor', () => {
    expect(withSkipped(['2026-09-30', '2026-10-10'], '2026-10-17', TODAY)).toEqual([
      '2026-10-10',
      '2026-10-17',
    ]);
  });

  it('texten: igår eller veckodag och datum', () => {
    expect(missedDayText('2026-10-17', TODAY)).toBe('igår');
    expect(missedDayText('2026-10-14', TODAY)).toBe('ons 14 okt');
  });
});

describe('Som vanligt', () => {
  // Frukost 400/20 och middag 700/40 tre dagar (lunch bara två dagar – för lite underlag).
  const log = [
    ...['2026-10-12', '2026-10-13', '2026-10-14'].flatMap((d) => [
      entry(d, 'frukost', 400, 20),
      entry(d, 'middag', 700, 40),
    ]),
    entry('2026-10-12', 'lunch', 600),
    entry('2026-10-13', 'lunch', 600),
  ];

  it('typiska måltider i dagens ordning; för lite underlag = inte med', () => {
    const usual = usualDay(log, SLOTS, TODAY);
    expect(usual).toEqual([
      { meal: 'frukost', kcal: 400, proteinG: 20 },
      { meal: 'middag', kcal: 700, proteinG: 40 },
    ]);
    expect(usualKcal(usual)).toBe(1100);
    expect(usualDay([], SLOTS, TODAY)).toEqual([]);
  });

  it('en uppskattad post per måltid, märkt som vanligt', () => {
    let n = 0;
    const entries = usualEntries(
      usualDay(log, SLOTS, TODAY),
      '2026-10-17',
      () => String(++n),
      1000,
    );
    expect(entries).toEqual([
      expect.objectContaining({
        id: '1',
        date: '2026-10-17',
        meal: 'frukost',
        name: 'Som vanligt',
        estimated: true,
        usual: true,
        createdAt: 1000,
      }),
      expect.objectContaining({ id: '2', meal: 'middag', usual: true, createdAt: 1001 }),
    ]);
    expect(dailyIntake(entries)[0]?.kcal).toBe(1100);
    expect(dailyIntake(entries)[0]?.proteinG).toBe(60);
  });
});
