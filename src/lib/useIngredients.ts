import { useMemo, useState } from 'react';
import { newId, type MealIngredient } from '../db/db.ts';
import { catalogFiberSource, fiberSum, type FiberAmount } from './fiber.ts';
import { buildCatalog, entryUnit, sourceOf, storedItems } from './foodCatalog.ts';
import type { FoodItem } from './foodSearch.ts';
import { decimalInput } from './format.ts';
import { totalOf, type Nutrients } from './nutrition.ts';
import { mergeUnits, parseUnitAmount, unitsFor, type FoodUnit } from './units.ts';
import type { Parsed } from './validation.ts';
import type { FoodData } from './useFoodData.ts';
import type { Livsmedel } from './livsmedel.ts';

export interface IngredientRow {
  key: string;
  foodId: string;
  name: string;
  per100: Nutrients;
  units: FoodUnit[];
  amount: string;
  unit: string;
  per100Unit?: 'ml';
}

export interface Ingredients {
  rows: IngredientRow[];
  parsedRows: {
    row: IngredientRow;
    parsed: Parsed<{ amount: number; unit: string; grams: number }>;
  }[];
  /** Summan av raderna med giltig mängd. */
  totals: Nutrients;
  /** Ingrediensernas vikt (gram) för raderna med giltig mängd. */
  totalG: number;
  /** Giltiga rader som gram + värden per 100 g (för uträkningar). */
  valid: { grams: number; per100: Nutrients }[];
  /**
   * Fibern i raderna med giltig mängd: `null` = ingen ingrediens har fiberdata, `undefined`
   * medan Livsmedelsverkets data laddas. `partial` när någon ingrediens saknar fiber.
   */
  fiber: FiberAmount | null | undefined;
  update: (key: string, change: Partial<IngredientRow>) => void;
  remove: (key: string) => void;
  add: (item: FoodItem, value: { amount: number; unit: string }, units: FoodUnit[]) => void;
  /** Raderna som sparade ingredienser, eller felet för första ogiltiga rad. */
  toItems: () => { ok: true; items: MealIngredient[] } | { ok: false; error: string };
}

/**
 * Ingredienser i en egen måltid eller ett recept: mängd och enhet per rad, enheterna
 * som livsmedlet har (plus den enhet ingrediensen sparades med).
 */
export function useIngredients(
  initial: readonly MealIngredient[],
  foodData: FoodData,
  livsmedel: Livsmedel | null,
): Ingredients {
  const catalog = useMemo(
    () => buildCatalog(livsmedel?.foods ?? [], storedItems(foodData)),
    [livsmedel, foodData],
  );
  const customUnits = useMemo(
    () => new Map(foodData.foodUnits.map((u) => [u.foodId, u.units])),
    [foodData.foodUnits],
  );
  const [rows, setRows] = useState<IngredientRow[]>(() =>
    initial.map((item) => {
      const food = catalog.get(item.foodId) ?? {
        id: item.foodId,
        name: item.name,
        source: sourceOf(item.foodId),
      };
      // Ingrediensens enhet som den vägde när den sparades.
      const logged = entryUnit(item);
      const row: IngredientRow = {
        key: newId(),
        foodId: item.foodId,
        name: item.name,
        per100: item.per100,
        units: mergeUnits(unitsFor(food, customUnits.get(item.foodId)), logged ? [logged] : []),
        amount: decimalInput(item.amount),
        unit: item.unit,
      };
      if (item.per100Unit) row.per100Unit = item.per100Unit;
      return row;
    }),
  );

  const parsedRows = rows.map((row) => ({
    row,
    parsed: parseUnitAmount(row.amount, row.unit, row.units),
  }));
  const valid = parsedRows.flatMap(({ row, parsed }) =>
    parsed.ok ? [{ grams: parsed.value.grams, per100: row.per100 }] : [],
  );

  const fiber = livsmedel
    ? fiberSum(
        parsedRows.flatMap(({ row, parsed }) =>
          parsed.ok ? [{ foodId: row.foodId, grams: parsed.value.grams, per100: row.per100 }] : [],
        ),
        catalogFiberSource(catalog, []),
      )
    : undefined;

  return {
    rows,
    parsedRows,
    valid,
    fiber,
    totals: totalOf(valid),
    totalG: valid.reduce((s, v) => s + v.grams, 0),
    update(key, change) {
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));
    },
    remove(key) {
      setRows((prev) => prev.filter((r) => r.key !== key));
    },
    add(item, value, units) {
      const row: IngredientRow = {
        key: newId(),
        foodId: item.id,
        name: item.name,
        per100: item.per100,
        units,
        amount: decimalInput(value.amount),
        unit: value.unit,
      };
      if (item.per100Unit === 'ml') row.per100Unit = 'ml';
      setRows((prev) => [...prev, row]);
    },
    toItems() {
      const items: MealIngredient[] = [];
      for (const { row, parsed } of parsedRows) {
        if (!parsed.ok) return { ok: false, error: `${row.name}: ${parsed.error}` };
        const ingredient: MealIngredient = {
          foodId: row.foodId,
          name: row.name,
          ...parsed.value,
          per100: row.per100,
        };
        if (row.per100Unit) ingredient.per100Unit = row.per100Unit;
        items.push(ingredient);
      }
      return { ok: true, items };
    },
  };
}
