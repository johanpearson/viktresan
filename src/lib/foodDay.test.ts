import { describe, expect, it } from 'vitest';
import type { FoodLogEntry, SavedMeal } from '../db/db.ts';
import {
  currentMealSlot,
  dayLabel,
  entriesToMealItems,
  entryCountText,
  loggedMealIngredients,
  mealSections,
  savedMealName,
} from './foodDay.ts';

const oats = { kcal: 370, proteinG: 13, carbsG: 59, fatG: 7 };
const milk = { kcal: 60, proteinG: 3.5, carbsG: 4.8, fatG: 3 };

function entry(over: Partial<FoodLogEntry> & Pick<FoodLogEntry, 'id' | 'meal'>): FoodLogEntry {
  return {
    date: '2026-09-27',
    foodId: 'lv:1',
    name: 'Havregryn',
    amount: 100,
    unit: 'g',
    grams: 100,
    per100: oats,
    createdAt: 1,
    ...over,
  };
}

describe('mealSections', () => {
  it('summerar kcal, makron och antal poster per måltid', () => {
    const sections = mealSections([
      entry({ id: 'a', meal: 'frukost', grams: 60 }),
      entry({ id: 'b', meal: 'frukost', foodId: 'lv:2', name: 'Mjölk', per100: milk, grams: 200 }),
      entry({ id: 'c', meal: 'middag', grams: 100 }),
    ]);
    expect(sections.map((s) => s.slot)).toEqual(['frukost', 'lunch', 'middag', 'mellanmal']);
    const [frukost, lunch, middag] = sections;
    // 60 g × 3,7 + 200 g × 0,6 = 222 + 120.
    expect(frukost?.totals.kcal).toBeCloseTo(342);
    expect(frukost?.totals.proteinG).toBeCloseTo(7.8 + 7);
    expect(frukost?.count).toBe(2);
    expect(lunch).toMatchObject({ count: 0, entries: [], totals: { kcal: 0 } });
    expect(middag?.totals.kcal).toBeCloseTo(370);
  });

  it('listar posterna i den ordning de loggades', () => {
    const [frukost] = mealSections([
      entry({ id: 'sen', meal: 'frukost', createdAt: 30 }),
      entry({ id: 'tidig', meal: 'frukost', createdAt: 10 }),
    ]);
    expect(frukost?.entries.map((e) => e.id)).toEqual(['tidig', 'sen']);
  });
});

describe('currentMealSlot', () => {
  it('ger måltiden som pågår vid klockslaget', () => {
    const at = (h: number, m = 0) => new Date(2026, 8, 27, h, m);
    expect(currentMealSlot(at(7, 30))).toBe('frukost');
    expect(currentMealSlot(at(12, 15))).toBe('lunch');
    expect(currentMealSlot(at(18))).toBe('middag');
    expect(currentMealSlot(at(15))).toBe('mellanmal');
    expect(currentMealSlot(at(22))).toBe('mellanmal');
  });
});

describe('loggedMealIngredients', () => {
  const meal: SavedMeal = {
    id: 'm1',
    name: 'Gröt',
    createdAt: 1,
    items: [
      { foodId: 'lv:1', name: 'Havregryn', amount: 60, unit: 'g', grams: 60, per100: oats },
      { foodId: 'lv:2', name: 'Mjölk', amount: 2, unit: 'dl', grams: 200, per100: milk },
    ],
  };

  it('skalar ingredienserna efter hur mycket av måltiden som loggades', () => {
    const half = entry({ id: 'x', meal: 'frukost', foodId: 'maltid:m1', name: 'Gröt', grams: 130 });
    expect(loggedMealIngredients(half, [meal])).toEqual([
      { name: 'Havregryn', grams: 30, kcal: 111 },
      { name: 'Mjölk', grams: 100, kcal: 60 },
    ]);
  });

  it('ger null för vanliga livsmedel och borttagna måltider', () => {
    expect(loggedMealIngredients(entry({ id: 'x', meal: 'lunch' }), [meal])).toBeNull();
    expect(
      loggedMealIngredients(entry({ id: 'y', meal: 'lunch', foodId: 'maltid:borta' }), [meal]),
    ).toBeNull();
  });
});

describe('texter', () => {
  it('antal poster och datumradens etikett', () => {
    expect(entryCountText(1)).toBe('1 post');
    expect(entryCountText(3)).toBe('3 poster');
    expect(dayLabel('2026-09-27', '2026-09-27')).toBe('Idag');
    expect(dayLabel('2026-09-26', '2026-09-27')).toBe('Igår');
    expect(dayLabel('2026-09-25', '2026-09-27')).toMatch(/fre.*25 sep/);
  });
});

describe('spara som egen måltid', () => {
  it('förifyller namnet med måltid och datum', () => {
    expect(savedMealName('frukost', '2026-09-26')).toBe('Frukost 26 sep');
    expect(savedMealName('mellanmal', '2026-01-03')).toBe('Mellanmål 3 jan');
  });

  it('kopierar posterna med mängd och enhet i loggordning', () => {
    const items = entriesToMealItems(
      [
        entry({
          id: 'b',
          meal: 'frukost',
          foodId: 'lv:2',
          name: 'Mjölk',
          per100: milk,
          amount: 2,
          unit: 'dl',
          grams: 206,
          per100Unit: 'ml',
          createdAt: 2,
        }),
        entry({ id: 'a', meal: 'frukost', amount: 1, unit: 'dl', grams: 40, createdAt: 1 }),
      ],
      [],
    );
    expect(items).toEqual([
      { foodId: 'lv:1', name: 'Havregryn', per100: oats, amount: 1, unit: 'dl', grams: 40 },
      {
        foodId: 'lv:2',
        name: 'Mjölk',
        per100: milk,
        amount: 2,
        unit: 'dl',
        grams: 206,
        per100Unit: 'ml',
      },
    ]);
  });

  it('delar upp en loggad måltid i ingredienserna i gram', () => {
    const meal: SavedMeal = {
      id: 'm1',
      name: 'Gröt',
      items: [
        { foodId: 'lv:1', name: 'Havregryn', per100: oats, amount: 1, unit: 'dl', grams: 40 },
        { foodId: 'lv:2', name: 'Mjölk', per100: milk, amount: 2, unit: 'dl', grams: 200 },
      ],
      createdAt: 1,
    };
    const items = entriesToMealItems(
      [
        entry({
          id: 'a',
          meal: 'frukost',
          foodId: 'maltid:m1',
          name: 'Gröt',
          grams: 120,
          amount: 0.5,
          unit: 'portion',
        }),
      ],
      [meal],
    );
    expect(items.map((i) => [i.name, i.amount, i.unit, i.grams])).toEqual([
      ['Havregryn', 20, 'g', 20],
      ['Mjölk', 100, 'g', 100],
    ]);
  });
});
