/**
 * Mat → Dag: dagens logg per måltid, pågående måltid och ingredienser i en
 * loggad sparad måltid. Rena funktioner.
 */
import type { FoodLogEntry, MealIngredient, SavedMeal } from '../db/db.ts';
import { addDays, toDayNumber } from './dates.ts';
import { mealFoodId } from './foodCatalog.ts';
import { recipeParts } from './recipes.ts';
import { formatDayMonth } from './format.ts';
import { resolveMealId, sortMealSlots, type MealId, type MealSlot } from './mealSlots.ts';
import { scaleNutrients, totalOf, type Nutrients } from './nutrition.ts';

export interface MealSection {
  slot: MealId;
  label: string;
  /** Postarna i den ordning de loggades. */
  entries: FoodLogEntry[];
  totals: Nutrients;
  count: number;
}

/**
 * En sektion per måltid i inställningens ordning, även tomma. En post vars måltid saknas
 * (t.ex. efter en import) visas i måltiden närmast dess loggtid i stället för att försvinna.
 */
export function mealSections(
  entries: readonly FoodLogEntry[],
  slots: readonly MealSlot[],
): MealSection[] {
  return sortMealSlots(slots).map(({ id, name }) => {
    const inSlot = entries
      .filter((e) => resolveMealId(slots, e.meal, e.createdAt) === id)
      .sort((a, b) => a.createdAt - b.createdAt);
    return {
      slot: id,
      label: name,
      entries: inSlot,
      totals: totalOf(inSlot),
      count: inSlot.length,
    };
  });
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
  if (entry.recipe) {
    const parts = recipeParts(entry.recipe, entry.grams);
    return parts.length === 0
      ? null
      : parts.map((item) => {
          const result: LoggedIngredient = {
            name: item.name,
            grams: item.grams,
            kcal: scaleNutrients(item.per100, item.grams).kcal,
          };
          if (item.per100Unit) result.per100Unit = item.per100Unit;
          return result;
        });
  }
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

/** Förifyllt namn när en måltid sparas som egen måltid: "Frukost 26 sep". */
export function savedMealName(mealName: string, date: string): string {
  return `${mealName} ${formatDayMonth(date)}`;
}

/**
 * Loggposter → ingredienser i en egen måltid, med mängd och enhet som de loggades.
 * En loggad sparad måltid delas upp i sina ingredienser (i gram, skalade efter loggad
 * mängd) – en måltid kan inte vara ingrediens i en annan.
 */
export function entriesToMealItems(
  entries: readonly FoodLogEntry[],
  meals: readonly SavedMeal[],
): MealIngredient[] {
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  return sorted.flatMap((entry): MealIngredient[] => {
    if (entry.recipe) {
      const parts = recipeParts(entry.recipe, entry.grams);
      if (parts.length > 0) {
        return parts.map((item) => {
          const grams = Math.round(item.grams * 10) / 10;
          const ingredient: MealIngredient = {
            foodId: item.foodId,
            name: item.name,
            per100: item.per100,
            amount: grams,
            unit: 'g',
            grams,
          };
          if (item.per100Unit) ingredient.per100Unit = item.per100Unit;
          return ingredient;
        });
      }
    }
    if (entry.foodId.startsWith('maltid:')) {
      const meal = meals.find((m) => mealFoodId(m.id) === entry.foodId);
      const totalG = meal?.items.reduce((s, i) => s + i.grams, 0) ?? 0;
      if (meal && totalG > 0) {
        const factor = entry.grams / totalG;
        return meal.items.map((item) => {
          const grams = Math.round(item.grams * factor * 10) / 10;
          const ingredient: MealIngredient = {
            foodId: item.foodId,
            name: item.name,
            per100: item.per100,
            amount: grams,
            unit: 'g',
            grams,
          };
          if (item.per100Unit) ingredient.per100Unit = item.per100Unit;
          return ingredient;
        });
      }
    }
    const ingredient: MealIngredient = {
      foodId: entry.foodId,
      name: entry.name,
      per100: entry.per100,
      amount: entry.amount,
      unit: entry.unit,
      grams: entry.grams,
    };
    if (entry.per100Unit) ingredient.per100Unit = entry.per100Unit;
    return [ingredient];
  });
}
