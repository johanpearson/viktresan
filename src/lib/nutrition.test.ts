import { describe, expect, it } from 'vitest';
import {
  averageKcal,
  combineIngredients,
  dailyIntake,
  defaultMealSlot,
  macroShares,
  mealLabel,
  rollingAverageKcal,
  scaleNutrients,
  totalOf,
} from './nutrition.ts';

const oats = { kcal: 370, proteinG: 13, carbsG: 59, fatG: 7 };
const milk = { kcal: 60, proteinG: 3.5, carbsG: 4.8, fatG: 3 };

describe('scaleNutrients', () => {
  it('räknar om värden per 100 g till gram', () => {
    expect(scaleNutrients(oats, 60)).toEqual({
      kcal: 222,
      proteinG: 7.8,
      carbsG: 35.4,
      fatG: expect.closeTo(4.2) as number,
    });
    expect(scaleNutrients(oats, 0).kcal).toBe(0);
  });
});

describe('combineIngredients', () => {
  it('ger totalvikt och värden per 100 g för en måltid', () => {
    const items = [
      { grams: 60, per100: oats },
      { grams: 200, per100: milk },
    ];
    const { totalG, per100 } = combineIngredients(items);
    expect(totalG).toBe(260);
    // 222 + 120 kcal på 260 g.
    expect(per100.kcal).toBeCloseTo((342 / 260) * 100);
    // Hela måltiden ger tillbaka summan.
    expect(scaleNutrients(per100, totalG).kcal).toBeCloseTo(totalOf(items).kcal);
    expect(scaleNutrients(per100, totalG).proteinG).toBeCloseTo(7.8 + 7);
  });

  it('tom måltid ger nollor', () => {
    expect(combineIngredients([])).toEqual({
      totalG: 0,
      per100: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    });
  });
});

describe('macroShares', () => {
  it('räknar energiandelar med 4/4/9 kcal per gram', () => {
    const shares = macroShares({ kcal: 0, proteinG: 25, carbsG: 50, fatG: 100 / 9 });
    expect(shares.protein).toBeCloseTo(0.25);
    expect(shares.carbs).toBeCloseTo(0.5);
    expect(shares.fat).toBeCloseTo(0.25);
  });

  it('ger nollor utan intag', () => {
    expect(macroShares({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })).toEqual({
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});

describe('dailyIntake', () => {
  it('summerar per dag, äldst först', () => {
    const days = dailyIntake([
      { date: '2026-01-02', grams: 100, per100: oats },
      { date: '2026-01-01', grams: 200, per100: milk },
      { date: '2026-01-02', grams: 50, per100: milk },
    ]);
    expect(days.map((d) => [d.date, d.kcal, d.entries])).toEqual([
      ['2026-01-01', 120, 1],
      ['2026-01-02', 400, 2],
    ]);
    expect(days[1]?.proteinG).toBeCloseTo(13 + 1.75);
  });
});

describe('rollingAverageKcal', () => {
  it('snittar loggade dagar i de senaste 7 dagarna', () => {
    const day = (date: string, kcal: number) => ({
      date,
      kcal,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      entries: 1,
    });
    const avg = rollingAverageKcal([
      day('2026-01-01', 2000),
      day('2026-01-02', 1800),
      // Lucka – räknas inte som 0.
      day('2026-01-07', 2200),
      day('2026-01-08', 1600),
    ]);
    expect(avg.map((a) => Math.round(a.kcal))).toEqual([2000, 1900, 2000, 1867]);
  });
});

describe('averageKcal', () => {
  const day = (date: string, kcal: number) => ({
    date,
    kcal,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    entries: 1,
  });

  it('snittar loggade dagar i fönstret fram till idag', () => {
    expect(
      averageKcal(
        [day('2026-01-01', 3000), day('2026-01-05', 2000), day('2026-01-08', 1800)],
        '2026-01-08',
      ),
    ).toEqual({ kcal: 1900, proteinG: 0, days: 2 });
  });

  it('null utan data i fönstret', () => {
    expect(averageKcal([day('2025-12-01', 2000)], '2026-01-08')).toBeNull();
  });
});

describe('måltider', () => {
  it('väljer måltid efter klockslag', () => {
    expect(defaultMealSlot(7)).toBe('frukost');
    expect(defaultMealSlot(12)).toBe('lunch');
    expect(defaultMealSlot(15)).toBe('mellanmal');
    expect(defaultMealSlot(18)).toBe('middag');
    expect(defaultMealSlot(23)).toBe('mellanmal');
  });

  it('har svenska etiketter', () => {
    expect(mealLabel('mellanmal')).toBe('Mellanmål');
  });
});
