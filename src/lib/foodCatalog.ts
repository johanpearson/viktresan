/**
 * Gör om lagrade livsmedel, måltider och loggposter till `FoodItem` och tar
 * fram snabbval (senaste, favoriter). Rena funktioner.
 */
import type { Favorite, FoodLogEntry, SavedMeal, StoredFood } from '../db/db.ts';
import type { FoodItem, FoodSource } from './foodSearch.ts';
import { combineIngredients } from './nutrition.ts';

export function storedToItem(food: StoredFood): FoodItem {
  const item: FoodItem = { id: food.id, name: food.name, source: food.source, per100: food.per100 };
  if (food.portionG !== undefined) item.portionG = food.portionG;
  if (food.portionName !== undefined) item.portionName = food.portionName;
  if (food.ean !== undefined) item.ean = food.ean;
  return item;
}

export function mealFoodId(mealId: string): string {
  return `maltid:${mealId}`;
}

/** En sparad måltid som livsmedel: en portion = hela måltiden. */
export function mealToItem(meal: SavedMeal): FoodItem {
  const { totalG, per100 } = combineIngredients(meal.items);
  return {
    id: mealFoodId(meal.id),
    name: meal.name,
    source: 'maltid',
    per100,
    portionG: totalG,
    portionName: 'portion',
  };
}

export function sourceOf(foodId: string): FoodSource {
  if (foodId.startsWith('lv:')) return 'livsmedelsverket';
  if (foodId.startsWith('off:')) return 'openfoodfacts';
  if (foodId.startsWith('maltid:')) return 'maltid';
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
  if (entry.portionName !== undefined && entry.portionCount !== undefined) {
    item.portionName = entry.portionName;
    item.portionG = Math.round((entry.grams / entry.portionCount) * 10) / 10;
  }
  return item;
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
): FoodItem[] {
  const sorted = [...log].sort((a, b) => changedAt(b) - changedAt(a));
  const seen = new Set<string>();
  const result: FoodItem[] = [];
  for (const entry of sorted) {
    if (seen.has(entry.foodId)) continue;
    seen.add(entry.foodId);
    result.push(catalog.get(entry.foodId) ?? entryToItem(entry));
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
