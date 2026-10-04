/**
 * Gör om lagrade livsmedel, måltider och loggposter till `FoodItem` och tar
 * fram snabbval (senaste, favoriter). Rena funktioner.
 */
import type { Favorite, FoodLogEntry, FoodOverride, SavedMeal, StoredFood } from '../db/db.ts';
import { catalogFiberSource, type FiberSource } from './fiber.ts';
import { applyOverride, overrideMap } from './foodNutrition.ts';
import type { FoodItem, FoodSource } from './foodSearch.ts';
import { combineIngredients } from './nutrition.ts';
import { isGram, round1, type FoodUnit, type UnitSource } from './units.ts';

export function storedToItem(food: StoredFood): FoodItem {
  const item: FoodItem = { id: food.id, name: food.name, source: food.source, per100: food.per100 };
  if (food.units !== undefined && food.units.length > 0) item.units = food.units;
  if (food.per100Unit !== undefined) item.per100Unit = food.per100Unit;
  if (food.ean !== undefined) item.ean = food.ean;
  if (food.fiberG !== undefined || food.sugarG !== undefined) {
    item.extra = {};
    if (food.fiberG !== undefined) item.extra.fiberG = food.fiberG;
    if (food.sugarG !== undefined) item.extra.sugarG = food.sugarG;
  }
  if (food.missing !== undefined && food.missing.length > 0) item.missing = [...food.missing];
  return item;
}

/** Egna livsmedel och cachade produkter som `FoodItem`, med egna näringsvärden inlagda. */
export function storedItems(data: {
  foods: readonly StoredFood[];
  overrides: readonly FoodOverride[];
}): FoodItem[] {
  const overrides = overrideMap(data.overrides);
  return data.foods.map((f) => applyOverride(storedToItem(f), overrides.get(f.id)));
}

export function mealFoodId(mealId: string): string {
  return `maltid:${mealId}`;
}

/** En sparad måltid som livsmedel: en portion = hela måltiden. */
export function mealToItem(meal: SavedMeal): FoodItem {
  const { totalG, per100 } = combineIngredients(meal.items);
  const item: FoodItem = { id: mealFoodId(meal.id), name: meal.name, source: 'maltid', per100 };
  if (totalG > 0) item.units = [{ name: 'portion', grams: totalG, source: 'egen' }];
  return item;
}

export function sourceOf(foodId: string): FoodSource {
  if (foodId.startsWith('lv:')) return 'livsmedelsverket';
  if (foodId.startsWith('fi:')) return 'fineli';
  if (foodId.startsWith('off:')) return 'openfoodfacts';
  if (foodId.startsWith('maltid:')) return 'maltid';
  if (foodId.startsWith('recept:')) return 'recept';
  if (foodId.startsWith('snabb:')) return 'snabb';
  return 'egen';
}

/** Livsmedlet så som det loggades (namn och värden kopierades in i posten). */
export function entryToItem(entry: FoodLogEntry): FoodItem {
  const item: FoodItem = {
    id: entry.foodId,
    name: entry.name,
    source: sourceOf(entry.foodId),
    per100: entry.per100,
  };
  const unit = entryUnit(entry);
  if (unit) item.units = [unit];
  if (entry.per100Unit !== undefined) item.per100Unit = entry.per100Unit;
  if (entry.recipe !== undefined) item.recipe = entry.recipe;
  return item;
}

/**
 * Enheten så som den vägde när posten loggades (gram ÷ antal), eller null för
 * gram. Används vid redigering så att en senare ändrad enhet inte slår igenom.
 */
export function entryUnit(
  entry: { unit: string; amount: number; grams: number },
  source: UnitSource = 'egen',
): FoodUnit | null {
  if (isGram(entry.unit) || !(entry.amount > 0)) return null;
  return { name: entry.unit, grams: round1(entry.grams / entry.amount), source };
}

function changedAt(entry: { createdAt: number; updatedAt?: number }): number {
  return entry.updatedAt ?? entry.createdAt;
}

/**
 * Senast loggade livsmedel, nyast först, ett per livsmedel. Finns livsmedlet
 * kvar i katalogen används den aktuella versionen.
 */
export function recentFoods(
  log: readonly FoodLogEntry[],
  catalog: ReadonlyMap<string, FoodItem>,
  limit = 8,
  /** Bara livsmedel som ska visas räknas mot `limit` (dolda, borttagna). */
  include: (item: FoodItem) => boolean = () => true,
): FoodItem[] {
  const sorted = [...log].sort((a, b) => changedAt(b) - changedAt(a));
  const seen = new Set<string>();
  const result: FoodItem[] = [];
  for (const entry of sorted) {
    if (seen.has(entry.foodId)) continue;
    seen.add(entry.foodId);
    const item = catalog.get(entry.foodId) ?? entryToItem(entry);
    if (!include(item)) continue;
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

/** Favoriter i den ordning de lades till. Okända (t.ex. borttagna) hoppas över. */
export function favoriteFoods(
  favorites: readonly Favorite[],
  catalog: ReadonlyMap<string, FoodItem>,
  log: readonly FoodLogEntry[],
): FoodItem[] {
  const result: FoodItem[] = [];
  for (const fav of favorites) {
    const known = catalog.get(fav.foodId);
    if (known) {
      result.push(known);
      continue;
    }
    // Livsmedelsverkets data kanske inte är laddad än – använd senaste loggposten.
    const logged = [...log].reverse().find((e) => e.foodId === fav.foodId);
    if (logged) result.push(entryToItem(logged));
  }
  return result;
}

export function buildCatalog(...lists: readonly (readonly FoodItem[])[]): Map<string, FoodItem> {
  const map = new Map<string, FoodItem>();
  for (const list of lists) for (const item of list) map.set(item.id, item);
  return map;
}

/** Det som behövs för att slå upp tidigare loggar: aktiva och borttagna egna livsmedel och måltider. */
interface HistoryData {
  meals: readonly SavedMeal[];
  overrides: readonly FoodOverride[];
  removed: { foods: readonly StoredFood[]; meals: readonly SavedMeal[] };
}

/**
 * Katalogen för tidigare loggar (analys, fiber): den synliga katalogen plus borttagna egna
 * livsmedel. Bara för uppslag – aldrig för sökning eller snabbval.
 */
export function historyCatalog(
  catalog: ReadonlyMap<string, FoodItem>,
  data: HistoryData,
): ReadonlyMap<string, FoodItem> {
  const { foods } = data.removed;
  if (foods.length === 0) return catalog;
  return buildCatalog(storedItems({ foods, overrides: data.overrides }), [...catalog.values()]);
}

/** Sparade måltider för tidigare loggars ingredienser: aktiva och borttagna. */
export function historyMeals(data: HistoryData): readonly SavedMeal[] {
  return data.removed.meals.length === 0 ? data.meals : [...data.meals, ...data.removed.meals];
}

/**
 * Ett eget livsmedel, en måltid eller ett recept som inte längre finns i katalogen: borttaget
 * (recept raderas, och egna livsmedel raderades före `deletedAt`) men återskapat ur en loggpost.
 * Visas aldrig i snabbval eller AI-underlag.
 */
export function isMissingOwn(item: FoodItem, catalog: ReadonlyMap<string, FoodItem>): boolean {
  const own = item.source === 'egen' || item.source === 'maltid' || item.source === 'recept';
  return own && !catalog.has(item.id);
}

/** Id:n för borttagna egna livsmedel och måltider (visas aldrig i snabbval). */
export function removedIds(data: Pick<HistoryData, 'removed'>): ReadonlySet<string> {
  return new Set([
    ...data.removed.foods.map((f) => f.id),
    ...data.removed.meals.map((m) => mealFoodId(m.id)),
  ]);
}

/**
 * Fiberkällan för matloggen ur katalogen, med borttagna egna livsmedel och måltider – så att
 * en borttagning aldrig ändrar tidigare loggars fiber.
 */
export function fiberSourceFor(
  catalog: ReadonlyMap<string, FoodItem>,
  data: HistoryData,
): FiberSource {
  return catalogFiberSource(historyCatalog(catalog, data), historyMeals(data));
}
