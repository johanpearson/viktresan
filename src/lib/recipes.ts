/**
 * Recept med portioner: näring per portion och per 100 g ur ingredienser och utbyte.
 * Rena funktioner utan I/O.
 *
 * Utbytet anges som antal portioner och/eller tillagad totalvikt. Rättens vikt är den
 * tillagade vikten om den finns, annars ingrediensernas summa (vattnet som kokar bort
 * eller tas upp syns då inte, men näringen per portion blir ändå rätt). En loggpost
 * får en kopia av värdena per 100 g och av receptet (`LoggedRecipe`), så att en senare
 * ändring av receptet bara påverkar framtida loggar.
 */
import type { LoggedRecipe, MealIngredient, Recipe } from '../db/db.ts';
import type { FoodItem } from './foodSearch.ts';
import { ZERO, scaleNutrients, totalOf, type Nutrients } from './nutrition.ts';
import { round1, type FoodUnit } from './units.ts';

export const RECIPE_PREFIX = 'recept:';

/** Enheten för en portion av ett recept. */
export const PORTION_UNIT = 'portion';

/** Snabbval när ett recept loggas i portioner. */
export const RECIPE_PORTIONS: readonly { value: number; label: string }[] = [
  { value: 0.5, label: '½' },
  { value: 1, label: '1' },
  { value: 1.5, label: '1½' },
  { value: 2, label: '2' },
];

export const SERVINGS_MAX = 50;
export const COOKED_WEIGHT_MAX_G = 20_000;

export function recipeFoodId(recipeId: string): string {
  return `${RECIPE_PREFIX}${recipeId}`;
}

export function isRecipeId(foodId: string): boolean {
  return foodId.startsWith(RECIPE_PREFIX);
}

export interface RecipeYield {
  /** Ingrediensernas vikt (rå). */
  rawG: number;
  /** Rättens vikt: tillagad vikt, annars ingrediensernas vikt. */
  yieldG: number;
  /** Om `yieldG` är uppmätt tillagad vikt (annars ingrediensernas summa). */
  cooked: boolean;
  servings: number | null;
  /** Gram per portion, `null` utan antal portioner. */
  portionG: number | null;
  total: Nutrients;
  per100: Nutrients;
  /** Näring per portion, `null` utan antal portioner. */
  perPortion: Nutrients | null;
}

/** Näring per 100 g och per portion ur ingredienserna och utbytet. */
export function recipeYield(recipe: {
  items: readonly Pick<MealIngredient, 'grams' | 'per100'>[];
  servings?: number | undefined;
  cookedWeightG?: number | undefined;
}): RecipeYield {
  const total = totalOf(recipe.items);
  const rawG = recipe.items.reduce((s, i) => s + i.grams, 0);
  const cooked = recipe.cookedWeightG != null && recipe.cookedWeightG > 0;
  const yieldG = cooked ? (recipe.cookedWeightG ?? 0) : rawG;
  const servings = recipe.servings != null && recipe.servings > 0 ? recipe.servings : null;
  return {
    rawG,
    yieldG,
    cooked,
    servings,
    portionG: servings && yieldG > 0 ? yieldG / servings : null,
    total,
    per100: yieldG > 0 ? scaleNutrients(total, 10_000 / yieldG) : ZERO,
    perPortion: servings ? scaleNutrients(total, 100 / servings) : null,
  };
}

/** Receptet som det ser ut nu – kopieras in i loggposten. */
export function loggedRecipe(recipe: Recipe): LoggedRecipe {
  return { yieldG: recipeYield(recipe).yieldG, items: recipe.items.map((i) => ({ ...i })) };
}

/** Receptet som livsmedel att logga: värden per 100 g och enheten "portion". */
export function recipeToItem(recipe: Recipe): FoodItem {
  const y = recipeYield(recipe);
  const item: FoodItem = {
    id: recipeFoodId(recipe.id),
    name: recipe.name,
    source: 'recept',
    per100: y.per100,
    recipe: loggedRecipe(recipe),
  };
  if (y.portionG !== null) {
    const unit: FoodUnit = { name: PORTION_UNIT, grams: round1(y.portionG), source: 'egen' };
    item.units = [unit];
  }
  return item;
}

/** Ingredienserna i en loggad mängd av receptet (gram skalade mot rättens vikt). */
export function recipeParts(
  recipe: LoggedRecipe,
  grams: number,
): (MealIngredient & { grams: number })[] {
  if (!(recipe.yieldG > 0)) return [];
  const factor = grams / recipe.yieldG;
  return recipe.items.map((item) => ({ ...item, grams: item.grams * factor }));
}

/** En kopia att göra en variant av: nytt id, "(kopia)" i namnet, nya tider. */
export function duplicateRecipe(recipe: Recipe, id: string, now = Date.now()): Recipe {
  const copy: Recipe = {
    id,
    name: `${recipe.name} (kopia)`.slice(0, 120),
    items: recipe.items.map((i) => ({ ...i })),
    createdAt: now,
  };
  if (recipe.servings !== undefined) copy.servings = recipe.servings;
  if (recipe.cookedWeightG !== undefined) copy.cookedWeightG = recipe.cookedWeightG;
  if (recipe.sourceUrl !== undefined) copy.sourceUrl = recipe.sourceUrl;
  return copy;
}

/**
 * Receptet att spara ur formuläret. Ett befintligt recept behåller id, `createdAt` och
 * källan och får `updatedAt`; utbytet sätts bara när det är angivet.
 */
export function recipeToSave(
  existing: Recipe | null,
  fields: {
    id: string;
    name: string;
    items: MealIngredient[];
    servings: number | null;
    cookedWeightG: number | null;
    /** Källan för ett importerat recept (ett befintligt behåller sin). */
    sourceUrl?: string | undefined;
  },
  now = Date.now(),
): Recipe {
  const saved: Recipe = {
    id: existing?.id ?? fields.id,
    name: fields.name,
    items: fields.items,
    createdAt: existing?.createdAt ?? now,
  };
  if (fields.servings !== null) saved.servings = fields.servings;
  if (fields.cookedWeightG !== null) saved.cookedWeightG = fields.cookedWeightG;
  const sourceUrl = existing?.sourceUrl ?? fields.sourceUrl;
  if (sourceUrl !== undefined) saved.sourceUrl = sourceUrl;
  if (existing) saved.updatedAt = now;
  return saved;
}

/** "6 portioner · 1 800 g tillagad" – kort text om utbytet. */
export function yieldText(y: RecipeYield, formatGrams: (g: number) => string): string {
  const parts: string[] = [];
  if (y.servings !== null) {
    parts.push(
      y.servings === 1 ? '1 portion' : `${String(y.servings).replace('.', ',')} portioner`,
    );
  }
  if (y.cooked) parts.push(`${formatGrams(y.yieldG)} tillagad`);
  return parts.join(' · ');
}
