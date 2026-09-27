/**
 * Mat → Dag: dagens logg per måltid, pågående måltid och ingredienser i en
 * loggad sparad måltid. Rena funktioner.
 */
import type { FoodLogEntry, SavedMeal } from '../db/db.ts';
import { addDays, toDayNumber } from './dates.ts';
import { mealFoodId } from './foodCatalog.ts';
import {
  MEAL_SLOTS,
  defaultMealSlot,
  scaleNutrients,
  totalOf,
  type MealSlot,
  type Nutrients,
} from './nutrition.ts';

export interface MealSection {
  slot: MealSlot;
  label: string;
  /** Postarna i den ordning de loggades. */
  entries: FoodLogEntry[];
  totals: Nutrients;
  count: number;
}

/** En sektion per måltid (alltid alla fyra, i dygnsordning), även tomma. */
export function mealSections(entries: readonly FoodLogEntry[]): MealSection[] {
  return MEAL_SLOTS.map(({ id, label }) => {
    const inSlot = entries.filter((e) => e.meal === id).sort((a, b) => a.createdAt - b.createdAt);
    return { slot: id, label, entries: inSlot, totals: totalOf(inSlot), count: inSlot.length };
  });
}

/** Måltiden som pågår vid klockslaget – den är utfälld som standard. */
export function currentMealSlot(now: Date = new Date()): MealSlot {
  return defaultMealSlot(now.getHours());
}

export function entryCountText(count: number): string {
  return count === 1 ? '1 post' : `${String(count)} poster`;
}

export interface LoggedIngredient {
  name: string;
  grams: number;
  per100Unit?: 'ml';
  kcal: number;
}

/**
 * Ingredienserna i en loggad sparad måltid, skalade efter hur mycket som
 * loggades. `null` om posten inte är en måltid eller måltiden är borttagen.
 * Måltiden kan ha ändrats sedan posten loggades – då är värdena ungefärliga.
 */
export function loggedMealIngredients(
  entry: FoodLogEntry,
  meals: readonly SavedMeal[],
): LoggedIngredient[] | null {
  if (!entry.foodId.startsWith('maltid:')) return null;
  const meal = meals.find((m) => mealFoodId(m.id) === entry.foodId);
  if (!meal || meal.items.length === 0) return null;
  const totalG = meal.items.reduce((s, i) => s + i.grams, 0);
  if (totalG <= 0) return null;
  const factor = entry.grams / totalG;
  return meal.items.map((item) => {
    const grams = item.grams * factor;
    const result: LoggedIngredient = {
      name: item.name,
      grams,
      kcal: scaleNutrients(item.per100, grams).kcal,
    };
    if (item.per100Unit) result.per100Unit = item.per100Unit;
    return result;
  });
}

const dayFormat = new Intl.DateTimeFormat('sv-SE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** Datumradens text: "Idag", "Igår" eller t.ex. "fre 25 sep.". */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Idag';
  if (date === addDays(today, -1)) return 'Igår';
  return dayFormat.format(new Date(toDayNumber(date) * 86_400_000));
}
