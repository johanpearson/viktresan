import { describe, expect, it } from 'vitest';
import type { HiddenFood } from '../db/db.ts';
import {
  categoryCounts,
  categoryOf,
  filtersFrom,
  hasFilters,
  hiddenCategoryEntry,
  hiddenFoodEntry,
  hiddenSourceEntry,
  isVisible,
  NO_FILTERS,
  suggestedCategories,
  visibleFoods,
} from './foodFilters.ts';
import type { FoodItem, FoodSource } from './foodSearch.ts';

const per100 = { kcal: 100, proteinG: 5, carbsG: 10, fatG: 2 };

function food(id: string, name: string, source: FoodSource, group?: string): FoodItem {
  return { id, name, source, per100, ...(group ? { group } : {}) };
}

const bread = food('lv:1', 'Bröd fullkorn råg', 'livsmedelsverket');
const candy = food('lv:2', 'Godis gelé', 'livsmedelsverket');
const fineliBread = food('fi:3', 'Rågbröd', 'fineli');
const offChips = food('off:73100', 'Chips sourcream', 'openfoodfacts');
const ownCandy = food('egen:x', 'Godis hemgjort', 'egen');
const meal = food('maltid:m', 'Frukost', 'maltid');
const all = [bread, candy, fineliBread, offChips, ownCandy, meal];

describe('filtersFrom', () => {
  it('delar upp livsmedel, kategorier och källor och hoppar över okända värden', () => {
    const hidden: HiddenFood[] = [
      hiddenFoodEntry(bread, 1),
      hiddenCategoryEntry('godis', 2),
      hiddenSourceEntry('fineli', 3),
      { key: 'kategori:okand', kind: 'kategori', value: 'okand', createdAt: 4 },
      { key: 'kalla:egen', kind: 'kalla', value: 'egen', createdAt: 5 },
    ];
    const filters = filtersFrom(hidden);
    expect([...filters.ids]).toEqual(['lv:1']);
    expect([...filters.categories]).toEqual(['godis']);
    expect([...filters.sources]).toEqual(['fineli']);
    expect(hasFilters(filters)).toBe(true);
    expect(filtersFrom([])).toBe(NO_FILTERS);
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });

  it('nycklarna följer `<kind>:<value>` och namnet sparas', () => {
    expect(hiddenFoodEntry(bread, 1)).toEqual({
      key: 'livsmedel:lv:1',
      kind: 'livsmedel',
      value: 'lv:1',
      name: 'Bröd fullkorn råg',
      createdAt: 1,
    });
    expect(hiddenCategoryEntry('brod', 2).key).toBe('kategori:brod');
    expect(hiddenSourceEntry('openfoodfacts', 3).key).toBe('kalla:openfoodfacts');
  });
});

describe('isVisible / visibleFoods', () => {
  it('utan filter visas allt (samma lista)', () => {
    expect(visibleFoods(all, NO_FILTERS)).toBe(all);
  });

  it('ett dolt livsmedel visas inte, oavsett källa', () => {
    const filters = filtersFrom([hiddenFoodEntry(bread), hiddenFoodEntry(ownCandy)]);
    expect(visibleFoods(all, filters).map((f) => f.id)).toEqual([
      'lv:2',
      'fi:3',
      'off:73100',
      'maltid:m',
    ]);
  });

  it('en dold kategori döljer databasernas livsmedel men aldrig egna', () => {
    const filters = filtersFrom([hiddenCategoryEntry('godis')]);
    expect(categoryOf(candy)).toBe('godis');
    expect(categoryOf(ownCandy)).toBe('godis');
    expect(isVisible(candy, filters)).toBe(false);
    expect(isVisible(ownCandy, filters)).toBe(true);
    expect(isVisible(bread, filters)).toBe(true);
  });

  it('kategorin kan komma ur Livsmedelsverkets grupp', () => {
    const grouped = food('lv:9', 'Polkagris', 'livsmedelsverket', 'Godis');
    const filters = filtersFrom([hiddenCategoryEntry('godis')]);
    expect(isVisible(grouped, filters, () => 'godis')).toBe(false);
  });

  it('en avstängd källa döljer bara den källan', () => {
    const filters = filtersFrom([hiddenSourceEntry('fineli'), hiddenSourceEntry('openfoodfacts')]);
    expect(visibleFoods(all, filters).map((f) => f.id)).toEqual([
      'lv:1',
      'lv:2',
      'egen:x',
      'maltid:m',
    ]);
  });
});

describe('categoryCounts / suggestedCategories', () => {
  const foods = [
    bread,
    food('lv:4', 'Bröd vitt', 'livsmedelsverket'),
    candy,
    food('lv:5', 'Godis choklad', 'livsmedelsverket'),
    food('lv:6', 'Glass vanilj', 'livsmedelsverket'),
    food('lv:7', 'Torskfilé', 'livsmedelsverket'),
    ownCandy,
  ];
  const category = (f: { name: string }) =>
    f.name.startsWith('Bröd')
      ? 'brod'
      : f.name.startsWith('Godis')
        ? 'godis'
        : f.name.startsWith('Glass')
          ? 'glass'
          : 'fisk';

  it('räknar livsmedel per kategori i databaskällorna och loggade poster', () => {
    const counts = categoryCounts(
      foods,
      [
        { foodId: 'lv:1', name: 'Bröd fullkorn råg' },
        { foodId: 'lv:1', name: 'Bröd fullkorn råg' },
        { foodId: 'egen:x', name: 'Godis hemgjort' },
      ],
      new Map(),
      category,
    );
    expect(counts.map((c) => [c.category, c.foods, c.logged])).toEqual([
      ['brod', 2, 2],
      ['fisk', 1, 0],
      ['godis', 2, 0],
      ['glass', 1, 0],
    ]);
    expect(counts[0]?.label).toBe('Bröd');
  });

  it('föreslår aldrig loggade kategorier, flest livsmedel först, inte redan dolda', () => {
    const counts = categoryCounts(foods, [{ foodId: 'lv:1', name: 'Bröd' }], new Map(), category);
    expect(suggestedCategories(counts, new Set()).map((c) => c.category)).toEqual([
      'godis',
      'fisk',
      'glass',
    ]);
    expect(suggestedCategories(counts, new Set(['godis'])).map((c) => c.category)).toEqual([
      'fisk',
      'glass',
    ]);
    expect(suggestedCategories(counts, new Set(), 1).map((c) => c.category)).toEqual(['godis']);
  });
});
