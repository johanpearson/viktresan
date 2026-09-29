import { describe, expect, it } from 'vitest';
import type { FoodLogEntry, MealIngredient, Recipe } from '../db/db.ts';
import { loggedMealIngredients } from './foodDay.ts';
import { dayNutrition } from './micronutrients.ts';
import { scaleNutrients } from './nutrition.ts';
import {
  duplicateRecipe,
  loggedRecipe,
  recipeFoodId,
  recipeParts,
  recipeToItem,
  recipeToSave,
  recipeYield,
} from './recipes.ts';

const lentils: MealIngredient = {
  foodId: 'lv:1',
  name: 'Linser torkade',
  amount: 500,
  unit: 'g',
  grams: 500,
  per100: { kcal: 340, proteinG: 24, carbsG: 50, fatG: 1.5 },
};
const tomatoes: MealIngredient = {
  foodId: 'lv:2',
  name: 'Krossade tomater',
  amount: 2,
  unit: 'förpackning',
  grams: 800,
  per100: { kcal: 25, proteinG: 1, carbsG: 4, fatG: 0.2 },
};
const oil: MealIngredient = {
  foodId: 'egen:olja',
  name: 'Olivolja',
  amount: 3,
  unit: 'msk',
  grams: 40,
  per100: { kcal: 900, proteinG: 0, carbsG: 0, fatG: 100 },
};

// Totalt: 1 700 + 200 + 360 = 2 260 kcal; 120 + 8 = 128 g protein; 1 340 g råvikt.
const stew: Recipe = {
  id: 'gryta',
  name: 'Linsgryta',
  items: [lentils, tomatoes, oil],
  servings: 6,
  cookedWeightG: 1800,
  createdAt: 1,
};

describe('recipeYield', () => {
  it('portioner och tillagad vikt: per portion och per 100 g tillagad', () => {
    const y = recipeYield(stew);
    expect(y.rawG).toBe(1340);
    expect(y.yieldG).toBe(1800);
    expect(y.cooked).toBe(true);
    expect(y.total.kcal).toBeCloseTo(2260);
    expect(y.portionG).toBe(300);
    expect(y.perPortion?.kcal).toBeCloseTo(2260 / 6);
    expect(y.perPortion?.proteinG).toBeCloseTo(128 / 6);
    expect(y.per100.kcal).toBeCloseTo((2260 / 1800) * 100);
    // En portion väger 300 g och har samma näring som 300 g av rätten.
    expect(scaleNutrients(y.per100, 300).kcal).toBeCloseTo(y.perPortion?.kcal ?? 0);
  });

  it('bara portioner: rättens vikt = ingrediensernas vikt', () => {
    const y = recipeYield({ items: stew.items, servings: 4 });
    expect(y.cooked).toBe(false);
    expect(y.yieldG).toBe(1340);
    expect(y.portionG).toBe(335);
    expect(y.perPortion?.kcal).toBeCloseTo(565);
    expect(y.per100.kcal).toBeCloseTo((2260 / 1340) * 100);
  });

  it('bara tillagad vikt: per 100 g, ingen portion', () => {
    const y = recipeYield({ items: stew.items, cookedWeightG: 2000 });
    expect(y.servings).toBeNull();
    expect(y.portionG).toBeNull();
    expect(y.perPortion).toBeNull();
    expect(y.per100.kcal).toBeCloseTo(113);
  });

  it('utan ingredienser blir allt noll', () => {
    const y = recipeYield({ items: [], servings: 2 });
    expect(y.per100.kcal).toBe(0);
    expect(y.portionG).toBeNull();
  });
});

describe('recipeToItem', () => {
  it('receptet som livsmedel: per 100 g, enheten portion och en kopia av receptet', () => {
    const item = recipeToItem(stew);
    expect(item.id).toBe(recipeFoodId('gryta'));
    expect(item.source).toBe('recept');
    expect(item.units).toEqual([{ name: 'portion', grams: 300, source: 'egen' }]);
    expect(item.per100.kcal).toBeCloseTo(125.56, 1);
    expect(item.recipe).toEqual({ yieldG: 1800, items: stew.items });
  });

  it('utan portioner finns bara gram', () => {
    const rest: Recipe = { ...stew };
    delete rest.servings;
    expect(recipeToItem(rest).units).toBeUndefined();
  });
});

describe('recipeParts', () => {
  it('ingredienserna skalas mot rättens vikt', () => {
    const parts = recipeParts(loggedRecipe(stew), 300);
    expect(parts.map((p) => Math.round(p.grams * 10) / 10)).toEqual([83.3, 133.3, 6.7]);
  });
});

/** En loggad portion så som FoodLogForm sparar den: värden per 100 g och receptet kopieras in. */
function logPortion(recipe: Recipe, portions: number): FoodLogEntry {
  const item = recipeToItem(recipe);
  const portionG = item.units?.[0]?.grams ?? 0;
  const entry: FoodLogEntry = {
    id: `logg-${String(portions)}`,
    date: '2026-09-24',
    meal: 'middag',
    foodId: item.id,
    name: item.name,
    amount: portions,
    unit: 'portion',
    grams: portionG * portions,
    per100: item.per100,
    createdAt: 1,
  };
  if (item.recipe) entry.recipe = item.recipe;
  return entry;
}

describe('redigering av recept', () => {
  it('gamla loggar behåller sin uträknade näring och sina ingredienser', () => {
    const before = logPortion(stew, 1);
    const kcalBefore = scaleNutrients(before.per100, before.grams).kcal;
    expect(kcalBefore).toBeCloseTo(2260 / 6);

    // Mer olja och 8 portioner i stället för 6.
    const edited = recipeToSave(
      stew,
      {
        id: 'annat-id',
        name: 'Linsgryta',
        items: [lentils, tomatoes, { ...oil, amount: 6, grams: 80 }],
        servings: 8,
        cookedWeightG: 1840,
      },
      5,
    );
    expect(edited.id).toBe('gryta');
    expect(edited.createdAt).toBe(1);
    expect(edited.updatedAt).toBe(5);

    const after = logPortion(edited, 1);
    expect(scaleNutrients(after.per100, after.grams).kcal).toBeCloseTo(2620 / 8);

    // Den gamla posten är oförändrad – värden, vikt och ingredienser.
    expect(scaleNutrients(before.per100, before.grams).kcal).toBeCloseTo(kcalBefore);
    expect(before.recipe?.items.find((i) => i.foodId === 'egen:olja')?.grams).toBe(40);
    expect(loggedMealIngredients(before, [])?.map((i) => Math.round(i.grams))).toEqual([
      83, 133, 7,
    ]);
    // Vitaminer och mineraler räknas på receptet som det såg ut när posten loggades.
    const lookup = (id: string) => (id === 'lv:1' ? { iron: 8 } : undefined);
    const day = dayNutrition('2026-09-24', {
      foodLog: [before],
      meals: [],
      lookup,
      supplementLog: [],
    });
    expect(day.rows.find((r) => r.key === 'iron')?.food).toBeCloseTo((8 * 500) / 6 / 100);
  });

  it('duplicera: ny kopia med eget id och "(kopia)" i namnet', () => {
    const copy = duplicateRecipe(stew, 'ny', 9);
    expect(copy).toEqual({ ...stew, id: 'ny', name: 'Linsgryta (kopia)', createdAt: 9 });
    expect(copy.items).not.toBe(stew.items);
  });

  it('källan (importerat recept) följer med vid redigering och duplicering', () => {
    const fields = { id: 'x', name: 'Gryta', items: [lentils], servings: 4, cookedWeightG: null };
    const imported = recipeToSave(null, { ...fields, sourceUrl: 'https://ica.se/r/1' }, 1);
    expect(imported.sourceUrl).toBe('https://ica.se/r/1');
    expect(recipeToSave(imported, fields, 2).sourceUrl).toBe('https://ica.se/r/1');
    expect(duplicateRecipe(imported, 'y', 3).sourceUrl).toBe('https://ica.se/r/1');
    expect(recipeToSave(null, fields, 1)).not.toHaveProperty('sourceUrl');
  });
});
