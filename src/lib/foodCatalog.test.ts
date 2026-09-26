import { describe, expect, it } from 'vitest';
import type { FoodLogEntry } from '../db/db.ts';
import {
  buildCatalog,
  entryToItem,
  entryUnit,
  favoriteFoods,
  mealToItem,
  recentFoods,
  sourceOf,
  storedToItem,
} from './foodCatalog.ts';

const per100 = { kcal: 100, proteinG: 1, carbsG: 2, fatG: 3 };

function entry(id: string, foodId: string, createdAt: number, extra: Partial<FoodLogEntry> = {}) {
  return {
    id,
    date: '2026-01-01',
    meal: 'lunch',
    foodId,
    name: `Namn ${foodId}`,
    amount: 100,
    unit: 'g',
    grams: 100,
    per100,
    createdAt,
    ...extra,
  } satisfies FoodLogEntry;
}

describe('foodCatalog', () => {
  it('gör om en måltid till ett livsmedel där en portion är hela måltiden', () => {
    const item = mealToItem({
      id: 'm1',
      name: 'Gröt',
      items: [
        {
          foodId: 'lv:1',
          name: 'Havregryn',
          amount: 60,
          unit: 'g',
          grams: 60,
          per100: { ...per100, kcal: 370 },
        },
        {
          foodId: 'lv:2',
          name: 'Mjölk',
          amount: 2,
          unit: 'dl',
          grams: 200,
          per100: { ...per100, kcal: 60 },
        },
      ],
      createdAt: 1,
    });
    expect(item).toMatchObject({
      id: 'maltid:m1',
      source: 'maltid',
      units: [{ name: 'portion', grams: 260 }],
    });
    expect((item.per100.kcal * 260) / 100).toBeCloseTo(222 + 120);
  });

  it('tar bara med valfria fält som finns', () => {
    expect(storedToItem({ id: 'egen:a', name: 'A', source: 'egen', per100, createdAt: 1 })).toEqual(
      { id: 'egen:a', name: 'A', source: 'egen', per100 },
    );
  });

  it('känner igen källan på id-prefixet', () => {
    expect(sourceOf('lv:1')).toBe('livsmedelsverket');
    expect(sourceOf('off:123')).toBe('openfoodfacts');
    expect(sourceOf('maltid:x')).toBe('maltid');
    expect(sourceOf('egen:x')).toBe('egen');
  });

  it('återskapar enheten ur en post loggad i en enhet (som den vägde då)', () => {
    const item = entryToItem(entry('e', 'off:1', 1, { amount: 1.5, unit: 'portion', grams: 90 }));
    expect(item).toMatchObject({
      source: 'openfoodfacts',
      units: [{ name: 'portion', grams: 60, source: 'egen' }],
    });
    expect(entryToItem(entry('g', 'lv:1', 1)).units).toBeUndefined();
    expect(entryUnit({ amount: 2, unit: 'st', grams: 120 })).toEqual({
      name: 'st',
      grams: 60,
      source: 'egen',
    });
    expect(entryUnit({ amount: 120, unit: 'g', grams: 120 })).toBeNull();
  });

  it('senaste: nyast först, ett per livsmedel, aktuell version från katalogen', () => {
    const catalog = buildCatalog([
      { id: 'lv:2', name: 'Nytt namn', source: 'livsmedelsverket', per100 },
    ]);
    const recent = recentFoods(
      [
        entry('a', 'lv:1', 1),
        entry('b', 'lv:2', 2),
        entry('c', 'lv:1', 3),
        entry('d', 'lv:3', 1, { updatedAt: 10 }),
      ],
      catalog,
    );
    expect(recent.map((r) => r.name)).toEqual(['Namn lv:3', 'Namn lv:1', 'Nytt namn']);
    expect(recentFoods([entry('a', 'lv:1', 1), entry('b', 'lv:2', 2)], catalog, 1)).toHaveLength(1);
  });

  it('favoriter: från katalogen, annars senaste loggposten, annars utelämnas', () => {
    const catalog = buildCatalog([{ id: 'egen:a', name: 'Eget', source: 'egen', per100 }]);
    const favorites = favoriteFoods(
      [
        { foodId: 'lv:9', createdAt: 1 },
        { foodId: 'egen:a', createdAt: 2 },
        { foodId: 'borta', createdAt: 3 },
      ],
      catalog,
      [entry('x', 'lv:9', 1)],
    );
    expect(favorites.map((f) => f.name)).toEqual(['Namn lv:9', 'Eget']);
  });
});
