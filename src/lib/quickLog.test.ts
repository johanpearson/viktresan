import { describe, expect, it } from 'vitest';
import type { FoodLogEntry } from '../db/db.ts';
import { entryToItem, recentFoods } from './foodCatalog.ts';
import { dayNutrition, weekNutrition } from './micronutrients.ts';
import { dailyIntake, totalOf } from './nutrition.ts';
import { parseQuick, quickDetail, quickEntry, quickFoodId, quickValuesOf } from './quickLog.ts';
import { foodDrinkMl } from './water.ts';

const DAY = '2026-09-24';

function quick(name: string, kcal: number, proteinG: number | null, id = 'q1'): FoodLogEntry {
  return quickEntry({ name, kcal, proteinG }, { id, date: DAY, meal: 'middag', now: 5 });
}

const potato: FoodLogEntry = {
  id: 'p1',
  date: DAY,
  meal: 'middag',
  foodId: 'lv:1',
  name: 'Potatis kokt',
  amount: 200,
  unit: 'g',
  grams: 200,
  per100: { kcal: 80, proteinG: 2, carbsG: 17, fatG: 0.1 },
  createdAt: 1,
};

describe('parseQuick', () => {
  it('kcal krävs, namn och protein är valfria', () => {
    expect(parseQuick({ name: ' Restaurang ', kcal: '850', protein: '' })).toEqual({
      ok: true,
      value: { name: 'Restaurang', kcal: 850, proteinG: null },
    });
    expect(parseQuick({ name: '', kcal: '700,4', protein: '35,5' })).toEqual({
      ok: true,
      value: { name: 'Snabblogg', kcal: 700, proteinG: 35.5 },
    });
    expect(parseQuick({ name: 'X', kcal: '', protein: '' }).ok).toBe(false);
    expect(parseQuick({ name: 'X', kcal: '0', protein: '' }).ok).toBe(false);
    expect(parseQuick({ name: 'X', kcal: '20000', protein: '' }).ok).toBe(false);
    expect(parseQuick({ name: 'X', kcal: '500', protein: '-1' }).ok).toBe(false);
  });
});

describe('quickEntry', () => {
  it('en portion = 100 "gram" så att per100 är hela värdet, märkt som uppskattad', () => {
    const entry = quick('Jobblunch', 700, 35);
    expect(entry).toMatchObject({
      foodId: 'snabb:jobblunch:700:35',
      name: 'Jobblunch',
      amount: 1,
      unit: 'portion',
      grams: 100,
      estimated: true,
      per100: { kcal: 700, proteinG: 35, carbsG: 0, fatG: 0 },
    });
    expect(totalOf([entry, potato]).kcal).toBeCloseTo(860);
    expect(dailyIntake([entry, potato])[0]?.kcal).toBeCloseTo(860);
  });

  it('samma namn och värden ger samma id – en rad under Senaste, kan favoritmarkeras', () => {
    const a = quick('Jobblunch', 700, 35, 'a');
    const b = { ...quick('jobblunch', 700, 35, 'b'), createdAt: 6 };
    expect(a.foodId).toBe(b.foodId);
    expect(recentFoods([a, b], new Map())).toHaveLength(1);
    expect(quickFoodId({ name: 'Jobblunch', kcal: 700, proteinG: null })).toBe(
      'snabb:jobblunch:700:',
    );
  });

  it('redigering behåller id, datum och createdAt', () => {
    const original = quick('Pizza', 900, null);
    const edited = quickEntry(
      { name: 'Pizza', kcal: 1100, proteinG: 40 },
      { id: 'nytt', date: '2026-09-25', meal: 'lunch', now: 9, editing: original },
    );
    expect(edited).toMatchObject({ id: 'q1', date: DAY, createdAt: 5, updatedAt: 9 });
    expect(edited.meal).toBe('lunch');
  });

  it('snabbval visas som "≈ 700 kcal" och fylls i formuläret', () => {
    const item = entryToItem(quick('Jobblunch', 700, 35));
    expect(item.source).toBe('snabb');
    expect(quickDetail(item)).toBe('≈ 700 kcal · 35 g protein');
    expect(quickValuesOf(item)).toEqual({ name: 'Jobblunch', kcal: 700, proteinG: 35 });
    const noProtein = entryToItem(quick('Fika', 300, null));
    expect(quickDetail(noProtein)).toBe('≈ 300 kcal');
    expect(quickValuesOf(noProtein).proteinG).toBeNull();
  });

  it('räknas aldrig som dryck', () => {
    expect(foodDrinkMl(quick('Öl på puben', 400, null))).toBeNull();
  });
});

describe('näringssummeringen', () => {
  const lookup = (id: string) => (id === 'lv:1' ? { vitaminC: 10 } : undefined);
  const input = {
    foodLog: [potato, quick('Restaurang', 900, 40)],
    meals: [],
    lookup,
    supplementLog: [],
  };

  it('snabbloggar ingår inte i vitaminer och mineraler men räknas och redovisas', () => {
    const day = dayNutrition(DAY, input);
    expect(day.rows.find((r) => r.key === 'vitaminC')?.food).toBeCloseTo(20);
    expect(day.estimatedEntries).toBe(1);
    // Snabbloggen är ingen "del utan data" – den redovisas för sig.
    expect(day.foodParts).toBe(1);
    expect(day.partsWithoutData).toBe(0);
    expect(day.loggedDays).toBe(1);
  });

  it('även i snittet över 7 dagar', () => {
    expect(weekNutrition(DAY, input).estimatedEntries).toBe(1);
  });
});
