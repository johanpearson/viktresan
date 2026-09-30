import { describe, expect, it } from 'vitest';
import type { FoodLogEntry, FoodOverride, StoredFood } from '../db/db.ts';
import { storedToItem } from './foodCatalog.ts';
import {
  applyOverride,
  applyOverrides,
  completeStoredFood,
  isIncomplete,
  logEntriesToUpdate,
  mergeOverride,
  nutritionStatus,
  nutritionValue,
  overlayExtras,
  overrideMap,
  updatedLogEntries,
  withoutOverride,
} from './foodNutrition.ts';
import type { FoodItem } from './foodSearch.ts';

/** En produkt från Open Food Facts utan fiber och fett. */
const off: FoodItem = {
  id: 'off:7310865004703',
  name: 'Havregryn',
  source: 'openfoodfacts',
  ean: '7310865004703',
  per100: { kcal: 370, proteinG: 13, carbsG: 60, fatG: 0 },
  extra: { sugarG: 1 },
  missing: ['fatG'],
};

const override = (values: FoodOverride['values']): FoodOverride => ({
  foodId: off.id,
  ean: '7310865004703',
  name: 'Havregryn',
  values,
  createdAt: 1,
});

describe('näringsvärdenas status', () => {
  it('saknade värden och källa per värde', () => {
    expect(isIncomplete(off)).toBe(true);
    expect(nutritionStatus(off).map((r) => [r.key, r.value, r.origin])).toEqual([
      ['kcal', 370, 'kalla'],
      ['proteinG', 13, 'kalla'],
      ['carbsG', 60, 'kalla'],
      ['fatG', null, 'saknas'],
      ['fiberG', null, 'saknas'],
      ['sugarG', 1, 'kalla'],
    ]);
  });

  it('sparade Open Food Facts-produkter: socker och saknade makron följer med', () => {
    const stored: StoredFood = {
      id: off.id,
      name: off.name,
      source: 'openfoodfacts',
      per100: off.per100,
      sugarG: 1,
      missing: ['fatG'],
      createdAt: 1,
    };
    const item = storedToItem(stored);
    expect(nutritionValue(item, 'fatG')).toBeNull();
    expect(nutritionValue(item, 'sugarG')).toBe(1);
    expect(nutritionValue(item, 'fiberG')).toBeNull();
  });
});

describe('egna värden ovanpå källans (override)', () => {
  it('eget värde vinner över källans, övriga värden kommer från källan', () => {
    // OFF har socker 1 g; eget värde 2 g och fiber 10 g (saknas i OFF).
    const item = applyOverride(off, override({ sugarG: 2, fiberG: 10 }));
    expect(nutritionValue(item, 'sugarG')).toBe(2);
    expect(nutritionValue(item, 'fiberG')).toBe(10);
    expect(nutritionValue(item, 'kcal')).toBe(370);
    expect(nutritionStatus(item).map((r) => r.origin)).toEqual([
      'kalla',
      'kalla',
      'kalla',
      'saknas',
      'egen',
      'egen',
    ]);
    expect(item.base).toEqual({ sugarG: 1, fiberG: null });
  });

  it('ett eget makro ersätter 0 och tar bort det ur saknade', () => {
    const item = applyOverride(off, override({ fatG: 7 }));
    expect(item.per100.fatG).toBe(7);
    expect(item.missing).toBeUndefined();
    expect(isIncomplete(item)).toBe(true); // fiber saknas fortfarande
    const complete = applyOverride(off, override({ fatG: 7, fiberG: 10 }));
    expect(isIncomplete(complete)).toBe(false);
  });

  it('idempotent: nya egna värden ersätter tidigare, utan egna värden = källan', () => {
    const first = applyOverride(off, override({ sugarG: 2, fatG: 7 }));
    const second = applyOverride(first, override({ fiberG: 10 }));
    expect(nutritionValue(second, 'sugarG')).toBe(1);
    expect(nutritionValue(second, 'fatG')).toBeNull();
    expect(nutritionValue(second, 'fiberG')).toBe(10);
    expect(withoutOverride(first)).toEqual(off);
    expect(applyOverride(first, undefined)).toEqual(off);
  });

  it('bara livsmedel med egna värden ändras i en lista', () => {
    const lv: FoodItem = {
      id: 'lv:1',
      name: 'Äpple',
      source: 'livsmedelsverket',
      per100: { kcal: 52, proteinG: 0.3, carbsG: 11, fatG: 0.2 },
      extra: { fiberG: 2 },
    };
    const list = applyOverrides([lv, off], overrideMap([override({ fiberG: 10 })]));
    expect(list[0]).toBe(lv);
    expect(nutritionValue(list[1] as FoodItem, 'fiberG')).toBe(10);
  });

  it('fiber och socker i uppslagen (fibersumma, rapport)', () => {
    const extras = new Map([[off.id, { sugarG: 1, saltG: 0.1 }]]);
    overlayExtras(extras, [override({ fiberG: 10, kcal: 360 })]);
    expect(extras.get(off.id)).toEqual({ sugarG: 1, saltG: 0.1, fiberG: 10 });
  });
});

describe('mergeOverride (kompletteringsformuläret)', () => {
  it('ändrade och ifyllda saknade värden blir egna, oförändrade behåller källan', () => {
    expect(
      mergeOverride(off, { kcal: 370, proteinG: 13, fatG: 7, fiberG: 10, sugarG: 1, carbsG: 60 }),
    ).toEqual({ fatG: 7, fiberG: 10 });
    // Rättat värde från källan.
    expect(mergeOverride(off, { kcal: 380 })).toEqual({ kcal: 380 });
  });

  it('tidigare egna värden behålls; tömt eget värde eller källans värde tar bort det', () => {
    const item = applyOverride(off, override({ fiberG: 10, sugarG: 2 }));
    expect(mergeOverride(item, { fiberG: 10, sugarG: 2, fatG: 7 })).toEqual({
      fiberG: 10,
      sugarG: 2,
      fatG: 7,
    });
    expect(mergeOverride(item, { fiberG: null })).toEqual({ sugarG: 2 });
    // Tillbaka till källans socker (1 g) = inget eget värde.
    expect(mergeOverride(item, { sugarG: 1 })).toEqual({ fiberG: 10 });
    // Källans värde går inte att ta bort genom att tömma fältet.
    expect(mergeOverride(off, { kcal: null })).toEqual({});
  });
});

describe('eget livsmedel kompletteras direkt', () => {
  it('ifyllda värden ersätter, tomma fiber/socker tas bort, makron behålls', () => {
    const food: StoredFood = {
      id: 'egen:1',
      name: 'Bröd',
      source: 'egen',
      per100: { kcal: 250, proteinG: 9, carbsG: 45, fatG: 3 },
      fiberG: 5,
      createdAt: 1,
    };
    const next = completeStoredFood(food, { fiberG: null, sugarG: 3, kcal: 240, fatG: null }, 9);
    expect(next).toEqual({
      ...food,
      per100: { kcal: 240, proteinG: 9, carbsG: 45, fatG: 3 },
      sugarG: 3,
      fiberG: undefined,
      updatedAt: 9,
    });
    expect('fiberG' in next).toBe(false);
  });
});

describe('uppdatera tidigare loggposter', () => {
  const entry = (id: string, date: string, patch: Partial<FoodLogEntry> = {}): FoodLogEntry => ({
    id,
    date,
    meal: 'frukost',
    foodId: off.id,
    name: 'Havregryn',
    amount: 1,
    unit: 'dl',
    grams: 35,
    per100: { kcal: 370, proteinG: 13, carbsG: 60, fatG: 0 },
    createdAt: 1,
    ...patch,
  });
  const log = [
    entry('a', '2026-09-01'),
    entry('b', '2026-09-24'), // precis 7 dagar med idag
    entry('c', '2026-09-23'),
    entry('d', '2026-09-30'),
    entry('e', '2026-09-30', { foodId: 'lv:1' }),
    entry('f', '2026-09-30', { estimated: true }),
    entry('g', '2026-09-29', { per100: { kcal: 370, proteinG: 13, carbsG: 60, fatG: 7 } }),
  ];
  const per100 = { kcal: 370, proteinG: 13, carbsG: 60, fatG: 7 };
  const ids = (entries: readonly FoodLogEntry[]) => entries.map((e) => e.id);

  it('bara idag, senaste 7 dagarna (idag + 6) eller alla – bara poster med andra värden', () => {
    const today = '2026-09-30';
    expect(ids(logEntriesToUpdate(log, off.id, per100, 'idag', today))).toEqual(['d']);
    expect(ids(logEntriesToUpdate(log, off.id, per100, 'vecka', today))).toEqual(['b', 'd']);
    expect(ids(logEntriesToUpdate(log, off.id, per100, 'alla', today))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('nya värden per 100 g, mängden oförändrad', () => {
    const [updated] = updatedLogEntries([entry('a', '2026-09-01')], per100, 42);
    expect(updated).toEqual({ ...entry('a', '2026-09-01'), per100, updatedAt: 42 });
  });
});
