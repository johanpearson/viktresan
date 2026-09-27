import { describe, expect, it } from 'vitest';
import type { ExtraNutrients } from '../data/nutrients.ts';
import type { FoodLogEntry, SavedMeal } from '../db/db.ts';
import { analyzeEntries, keyFigureNotes, partsOf } from './mealAnalysis.ts';

function entry(
  id: string,
  foodId: string,
  grams: number,
  per100: FoodLogEntry['per100'],
): FoodLogEntry {
  return {
    id,
    date: '2026-09-26',
    meal: 'frukost',
    foodId,
    name: id,
    amount: grams,
    unit: 'g',
    grams,
    per100,
    createdAt: 1,
  };
}

const HAVREGRYN = { kcal: 370, proteinG: 13, carbsG: 59, fatG: 7 };
const MJOLK = { kcal: 60, proteinG: 3.5, carbsG: 4.8, fatG: 3 };
const EGEN = { kcal: 200, proteinG: 10, carbsG: 20, fatG: 8 };

const EXTRA: Record<string, ExtraNutrients> = {
  'lv:1': { fiberG: 10, vitaminB12: 0, iron: 4 },
  'lv:2': { fiberG: 0, vitaminB12: 0.4, calcium: 120, iron: 0 },
};
const lookup = (id: string) => EXTRA[id];

describe('analyzeEntries', () => {
  const log = [entry('Gröt', 'lv:1', 50, HAVREGRYN), entry('Mjölk', 'lv:2', 200, MJOLK)];

  it('summerar energi, makron, fiber, vitaminer och mineraler', () => {
    const a = analyzeEntries(log, [], lookup, { targetKcal: 2000, proteinGoalG: 128 });
    expect(a.totals.kcal).toBeCloseTo(305);
    expect(a.totals.proteinG).toBeCloseTo(13.5);
    const row = (key: string) => a.rows.find((r) => r.key === key);
    expect(row('fiberG')?.amount).toBeCloseTo(5);
    expect(row('calcium')?.amount).toBeCloseTo(240);
    expect(row('iron')?.amount).toBeCloseTo(2);
    expect(row('vitaminB12')?.amount).toBeCloseTo(0.8);
    // Näringsämnen som inte finns för något livsmedel visas inte.
    expect(row('vitaminC')).toBeUndefined();
  });

  it('räknar procent av dagsmål och av referensintag', () => {
    const a = analyzeEntries(log, [], lookup, { targetKcal: 2000, proteinGoalG: 135 });
    const kcal = a.rows.find((r) => r.key === 'kcal');
    expect(kcal?.pctGoal).toBeCloseTo(305 / 2000);
    expect(kcal?.pctRi).toBeCloseTo(305 / 2000);
    expect(a.rows.find((r) => r.key === 'proteinG')?.pctGoal).toBeCloseTo(0.1);
    expect(a.rows.find((r) => r.key === 'proteinG')?.pctRi).toBeCloseTo(13.5 / 50);
    expect(a.rows.find((r) => r.key === 'calcium')?.pctRi).toBeCloseTo(240 / 800);
    expect(a.rows.find((r) => r.key === 'fiberG')?.riSource).toBe('NNR');
    expect(a.shareOfTarget).toBeCloseTo(305 / 2000);
  });

  it('räknar nyckeltalen', () => {
    const a = analyzeEntries(log, [], lookup, { targetKcal: null, proteinGoalG: null });
    expect(a.proteinPer100Kcal).toBeCloseTo((13.5 / 305) * 100);
    expect(a.fiberPer1000Kcal).toBeCloseTo((5 / 305) * 1000);
    expect(a.shareOfTarget).toBeNull();
    expect(a.rows.find((r) => r.key === 'kcal')?.pctGoal).toBeNull();
  });

  it('anger täckning när fiber saknas för vissa poster', () => {
    const a = analyzeEntries(
      [entry('Gröt', 'lv:1', 50, HAVREGRYN), entry('Eget', 'egen:x', 150, EGEN)],
      [],
      lookup,
      { targetKcal: null, proteinGoalG: null },
    );
    expect(a.rows.find((r) => r.key === 'fiberG')?.coverage).toBeCloseTo(0.25);
    expect(a.rows.find((r) => r.key === 'kcal')?.coverage).toBe(1);
    expect(a.partsWithoutExtra).toBe(1);
  });

  it('delar upp en loggad sparad måltid i ingredienserna', () => {
    const meal: SavedMeal = {
      id: 'm1',
      name: 'Gröt med mjölk',
      items: [
        { foodId: 'lv:1', name: 'Havregryn', per100: HAVREGRYN, amount: 50, unit: 'g', grams: 50 },
        { foodId: 'lv:2', name: 'Mjölk', per100: MJOLK, amount: 150, unit: 'g', grams: 150 },
      ],
      createdAt: 1,
    };
    // Halva måltiden loggad.
    const logged = entry('Gröt med mjölk', 'maltid:m1', 100, { ...HAVREGRYN });
    const parts = partsOf(logged, [meal], lookup);
    expect(parts.map((p) => p.grams)).toEqual([25, 75]);
    const a = analyzeEntries([logged], [meal], lookup, { targetKcal: null, proteinGoalG: null });
    expect(a.totals.kcal).toBeCloseTo(92.5 + 45);
    expect(a.rows.find((r) => r.key === 'fiberG')?.amount).toBeCloseTo(2.5);
  });

  it('tom lista ger nollor och inga nyckeltal', () => {
    const a = analyzeEntries([], [], lookup, { targetKcal: 2000, proteinGoalG: 100 });
    expect(a.totals.kcal).toBe(0);
    expect(a.proteinPer100Kcal).toBeNull();
    expect(a.fiberPer1000Kcal).toBeNull();
    expect(a.rows.map((r) => r.key)).toEqual(['kcal', 'proteinG', 'carbsG', 'fatG']);
  });
});

describe('keyFigureNotes', () => {
  it('kommenterar protein- och fibertäthet', () => {
    const rich = analyzeEntries(
      [entry('Kvarg', 'lv:3', 200, { kcal: 60, proteinG: 11, carbsG: 3, fatG: 0.2 })],
      [],
      () => ({ fiberG: 0 }),
      { targetKcal: null, proteinGoalG: null },
    );
    expect(keyFigureNotes(rich)).toEqual([
      'Proteinrikt – bra för mättnaden.',
      'Lite fiber i förhållande till energin.',
    ]);
  });
});
