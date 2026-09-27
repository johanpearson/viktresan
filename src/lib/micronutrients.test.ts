import { describe, expect, it } from 'vitest';
import type { ExtraNutrients } from '../data/nutrients.ts';
import type { FoodLogEntry, SupplementIntake } from '../db/db.ts';
import { dayNutrition, upperLimitWarnings, weekNutrition } from './micronutrients.ts';

const DAY = '2026-09-24';

function entry(id: string, foodId: string, name: string, grams: number, date = DAY): FoodLogEntry {
  return {
    id,
    date,
    meal: 'lunch',
    foodId,
    name,
    per100: { kcal: 100, proteinG: 10, carbsG: 0, fatG: 5 },
    amount: grams,
    unit: 'g',
    grams,
    createdAt: 1,
  };
}

function intake(
  id: string,
  name: string,
  nutrients: SupplementIntake['nutrients'],
  date = DAY,
  doses = 1,
): SupplementIntake {
  return { id: `${id}:${date}`, date, supplementId: id, name, doses, nutrients, createdAt: 1 };
}

const EXTRA: Record<string, ExtraNutrients> = {
  'lv:lax': { vitaminD: 10, vitaminB12: 3, iodine: 20 },
  'lv:lever': { vitaminA: 10000, iron: 10 },
};
const lookup = (id: string) => EXTRA[id] ?? null;

describe('dayNutrition', () => {
  it('summerar mat och tillskott per näringsämne', () => {
    const day = dayNutrition(DAY, {
      foodLog: [entry('1', 'lv:lax', 'Lax', 150), entry('2', 'egen:x', 'Egen', 100)],
      meals: [],
      lookup,
      supplementLog: [intake('d', 'D-vitamin', [{ key: 'vitaminD', amount: 1000, unit: 'IE' }])],
    });
    const d = day.rows.find((r) => r.key === 'vitaminD');
    expect(d).toMatchObject({ food: 15, supplements: 25, total: 40, ri: 5, unit: 'µg' });
    expect(d?.contributors).toEqual([
      { name: 'D-vitamin', source: 'tillskott', amount: 25 },
      { name: 'Lax', source: 'mat', amount: 15 },
    ]);
    expect(day.rows.find((r) => r.key === 'vitaminB12')?.total).toBeCloseTo(4.5);
    // Egna livsmedel saknar data → totalen kan vara i underkant.
    expect(day.partsWithoutData).toBe(1);
    expect(day.foodParts).toBe(2);
    expect(day.supplementCount).toBe(1);
    expect(day.loggedDays).toBe(1);
  });

  it('andra dagar räknas inte', () => {
    const day = dayNutrition(DAY, {
      foodLog: [entry('1', 'lv:lax', 'Lax', 100, '2026-09-23')],
      meals: [],
      lookup,
      supplementLog: [],
    });
    expect(day.rows.every((r) => r.total === 0)).toBe(true);
    expect(day.loggedDays).toBe(0);
  });

  it('snitt 7 dagar räknas per loggad dag', () => {
    const week = weekNutrition(DAY, {
      foodLog: [entry('1', 'lv:lax', 'Lax', 100, '2026-09-20')],
      meals: [],
      lookup,
      supplementLog: [
        intake('d', 'D', [{ key: 'vitaminD', amount: 20, unit: 'µg' }], '2026-09-24'),
        // Utanför de sju dagarna.
        intake('d', 'D', [{ key: 'vitaminD', amount: 20, unit: 'µg' }], '2026-09-17'),
      ],
    });
    expect(week.loggedDays).toBe(2);
    expect(week.rows.find((r) => r.key === 'vitaminD')).toMatchObject({
      food: 5,
      supplements: 10,
      total: 15,
    });
  });
});

describe('upperLimitWarnings', () => {
  it('varnar när mat + tillskott överstiger UL, med största bidragen', () => {
    const day = dayNutrition(DAY, {
      foodLog: [entry('1', 'lv:lax', 'Lax', 200)],
      meals: [],
      lookup,
      supplementLog: [
        intake('d', 'D-vitamin forte', [{ key: 'vitaminD', amount: 4000, unit: 'IE' }]),
      ],
    });
    const warnings = upperLimitWarnings(day);
    expect(warnings.map((w) => [w.key, w.amount, w.limit.ul])).toEqual([['vitaminD', 120, 100]]);
    expect(warnings[0]?.top.map((c) => c.name)).toEqual(['D-vitamin forte', 'Lax']);
  });

  it('exakt på gränsen varnar inte', () => {
    const day = dayNutrition(DAY, {
      foodLog: [],
      meals: [],
      lookup,
      supplementLog: [intake('z', 'Zink', [{ key: 'zinc', amount: 25, unit: 'mg' }])],
    });
    expect(upperLimitWarnings(day)).toEqual([]);
  });

  it('gränser som bara gäller tillskott jämförs bara med tillskotten', () => {
    const day = dayNutrition(DAY, {
      foodLog: [entry('1', 'lv:mg', 'Pumpafrön', 100)],
      meals: [],
      lookup: (id) => (id === 'lv:mg' ? { magnesium: 500 } : null),
      supplementLog: [intake('m', 'Magnesium', [{ key: 'magnesium', amount: 200, unit: 'mg' }])],
    });
    // 700 mg totalt men 200 mg från tillskott → under 250 mg.
    expect(upperLimitWarnings(day)).toEqual([]);
    const more = dayNutrition(DAY, {
      foodLog: [entry('1', 'lv:mg', 'Pumpafrön', 100)],
      meals: [],
      lookup: (id) => (id === 'lv:mg' ? { magnesium: 500 } : null),
      supplementLog: [
        intake('m', 'Magnesium', [{ key: 'magnesium', amount: 200, unit: 'mg' }], DAY, 2),
      ],
    });
    const [warning] = upperLimitWarnings(more);
    expect(warning).toMatchObject({ key: 'magnesium', amount: 400 });
    expect(warning?.top).toEqual([{ name: 'Magnesium', source: 'tillskott', amount: 400 }]);
  });

  it('mat ensam kan också ge varning (lever och vitamin A)', () => {
    const day = dayNutrition(DAY, {
      foodLog: [entry('1', 'lv:lever', 'Lever', 50)],
      meals: [],
      lookup,
      supplementLog: [],
    });
    expect(upperLimitWarnings(day).map((w) => w.key)).toEqual(['vitaminA']);
  });
});
