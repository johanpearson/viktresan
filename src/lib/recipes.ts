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
import type { FoodLogEntry, LoggedRecipe, MealIngredient, Recipe } from '../db/db.ts';
import type { FoodItem } from './foodSearch.ts';
import { ZERO, scaleNutrients, totalOf, type Nutrients } from './nutrition.ts';
import { decimalInput } from './format.ts';
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
    /** Engångsrätt (inte bland recepten); utan värde behålls det befintliga. */
    oneOff?: boolean | undefined;
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
  if (fields.oneOff ?? existing?.oneOff === true) saved.oneOff = true;
  // Pågående matlådor följer med en ändring av receptet.
  if (existing?.batch) saved.batch = existing.batch;
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

const DAY_MS = 86_400_000;

/** Matlådor visas så här många dagar efter att omgången lagades. */
export const BATCH_DAYS = 7;

/** Recept som inte loggats eller ändrats på så här många dagar hamnar i Arkiv. */
export const ARCHIVE_DAYS = 60;

type LogRef = Pick<FoodLogEntry, 'foodId' | 'unit' | 'amount' | 'grams' | 'createdAt'>;

/** Portioner av omgången som loggats (i portioner, annars gram ÷ portionens vikt). */
export function batchPortionsUsed(recipe: Recipe, log: readonly LogRef[]): number {
  const { batch } = recipe;
  if (!batch) return 0;
  const id = recipeFoodId(recipe.id);
  const { portionG } = recipeYield(recipe);
  let used = 0;
  for (const e of log) {
    if (e.foodId !== id || e.createdAt < batch.startedAt) continue;
    if (e.unit === PORTION_UNIT) used += e.amount;
    else if (portionG) used += e.grams / portionG;
  }
  return used;
}

export interface Leftover {
  recipe: Recipe;
  /** Portioner kvar (avrundat till halva). */
  left: number;
}

/**
 * Matlådor: recept med en lagad omgång de senaste `BATCH_DAYS` dagarna som har minst en
 * halv portion kvar, senast lagade först.
 */
export function leftovers(
  recipes: readonly Recipe[],
  log: readonly LogRef[],
  now = Date.now(),
): Leftover[] {
  const result: Leftover[] = [];
  for (const recipe of recipes) {
    const { batch } = recipe;
    if (!batch || now - batch.startedAt > BATCH_DAYS * DAY_MS) continue;
    const left = Math.round((batch.portions - batchPortionsUsed(recipe, log)) * 2) / 2;
    if (left >= 0.5) result.push({ recipe, left });
  }
  return result.sort((a, b) => (b.recipe.batch?.startedAt ?? 0) - (a.recipe.batch?.startedAt ?? 0));
}

/**
 * Erbjud "Resten blir matlådor" när receptet loggas: minst två portioner och ingen
 * pågående omgång med portioner kvar.
 */
export function canStartBatch(recipe: Recipe, log: readonly LogRef[], now = Date.now()): boolean {
  if (recipe.servings === undefined || recipe.servings < 2) return false;
  return leftovers([recipe], log, now).length === 0;
}

/** Receptet med en ny omgång som lagades `startedAt` (första portionen loggas samtidigt). */
export function withBatch(recipe: Recipe, startedAt: number): Recipe {
  return { ...recipe, batch: { startedAt, portions: recipe.servings ?? 1 } };
}

/** Receptet utan omgång ("Slut" på en matlåda). */
export function withoutBatch(recipe: Recipe): Recipe {
  const rest = { ...recipe };
  delete rest.batch;
  return rest;
}

/** Senaste aktivitet: skapat, ändrat eller loggat. */
export function lastUsedAt(recipe: Recipe, log: readonly LogRef[]): number {
  const id = recipeFoodId(recipe.id);
  let last = Math.max(recipe.createdAt, recipe.updatedAt ?? 0);
  for (const e of log) if (e.foodId === id && e.createdAt > last) last = e.createdAt;
  return last;
}

/** Arkiv: engångsrätter och recept som inte använts på `ARCHIVE_DAYS` dagar. */
export function isArchived(recipe: Recipe, log: readonly LogRef[], now = Date.now()): boolean {
  return recipe.oneOff === true || now - lastUsedAt(recipe, log) > ARCHIVE_DAYS * DAY_MS;
}

/** "1 portion" / "2,5 portioner". */
export function portionsText(n: number): string {
  return n === 1 ? '1 portion' : `${decimalInput(n)} portioner`;
}

/** Dagnummer i lokal tid (för "lagad igår"). */
function localDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

/** "lagad idag" / "lagad igår" / "lagad för 3 dagar sedan". */
export function cookedAgoText(startedAt: number, now = Date.now()): string {
  const days = Math.round(localDay(now) - localDay(startedAt));
  if (days <= 0) return 'lagad idag';
  return days === 1 ? 'lagad igår' : `lagad för ${String(days)} dagar sedan`;
}
