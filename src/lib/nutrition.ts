/**
 * Näringsberäkningar för matloggen. Rena funktioner utan I/O.
 * Alla livsmedel beskrivs per 100 g; loggposter har gram.
 */
import { addDays } from './dates.ts';

/** Energi och makronäringsämnen per 100 g (eller totalt för en post). */
export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export type MealSlot = 'frukost' | 'lunch' | 'middag' | 'mellanmal';

export const MEAL_SLOTS: readonly { id: MealSlot; label: string }[] = [
  { id: 'frukost', label: 'Frukost' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'middag', label: 'Middag' },
  { id: 'mellanmal', label: 'Mellanmål' },
];

export function mealLabel(slot: MealSlot): string {
  return MEAL_SLOTS.find((m) => m.id === slot)?.label ?? slot;
}

/** Förvald måltid efter klockslag. */
export function defaultMealSlot(hour: number): MealSlot {
  if (hour >= 4 && hour < 10) return 'frukost';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 17 && hour < 21) return 'middag';
  return 'mellanmal';
}

export const ZERO: Nutrients = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** Näringsvärden för `grams` gram av ett livsmedel med värden per 100 g. */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const f = grams / 100;
  return {
    kcal: per100.kcal * f,
    proteinG: per100.proteinG * f,
    carbsG: per100.carbsG * f,
    fatG: per100.fatG * f,
  };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
  };
}

export function sumNutrients(list: readonly Nutrients[]): Nutrients {
  return list.reduce(addNutrients, ZERO);
}

export interface Portioned {
  grams: number;
  per100: Nutrients;
}

/** Summan av poster (gram × värden per 100 g). */
export function totalOf(items: readonly Portioned[]): Nutrients {
  return sumNutrients(items.map((i) => scaleNutrients(i.per100, i.grams)));
}

/**
 * Slår ihop ingredienser till en rätt: totalvikt och värden per 100 g.
 * Används för sparade måltider, som sedan loggas som ett livsmedel där en
 * portion = hela måltiden.
 */
export function combineIngredients(items: readonly Portioned[]): {
  totalG: number;
  per100: Nutrients;
} {
  const totalG = items.reduce((s, i) => s + i.grams, 0);
  if (totalG <= 0) return { totalG: 0, per100: ZERO };
  return { totalG, per100: scaleNutrients(totalOf(items), 10_000 / totalG) };
}

export interface MacroShare {
  protein: number;
  carbs: number;
  fat: number;
}

/** Andel av energin från protein, kolhydrater och fett (4/4/9 kcal per gram). 0 utan intag. */
export function macroShares(n: Nutrients): MacroShare {
  const protein = n.proteinG * 4;
  const carbs = n.carbsG * 4;
  const fat = n.fatG * 9;
  const total = protein + carbs + fat;
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return { protein: protein / total, carbs: carbs / total, fat: fat / total };
}

export interface DatedPortion extends Portioned {
  date: string;
}

export interface DailyIntake extends Nutrients {
  date: string;
  /** Antal loggade poster. */
  entries: number;
}

/** Intag per dag, äldst först. Dagar utan poster saknas i listan. */
export function dailyIntake(entries: readonly DatedPortion[]): DailyIntake[] {
  const byDate = new Map<string, DailyIntake>();
  for (const e of entries) {
    const n = scaleNutrients(e.per100, e.grams);
    const prev = byDate.get(e.date);
    byDate.set(
      e.date,
      prev
        ? { ...addNutrients(prev, n), date: e.date, entries: prev.entries + 1 }
        : { ...n, date: e.date, entries: 1 },
    );
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Glidande 7-dagarssnitt av kcal: för varje dag i `days` snittet av de loggade
 * dagarna i fönstret [dag − 6, dag]. Olagda dagar räknas inte som 0.
 */
export function rollingAverageKcal(
  days: readonly DailyIntake[],
  windowDays = 7,
): { date: string; kcal: number }[] {
  return days.map((d) => {
    const from = addDays(d.date, -(windowDays - 1));
    const inWindow = days.filter((x) => x.date >= from && x.date <= d.date);
    return { date: d.date, kcal: inWindow.reduce((s, x) => s + x.kcal, 0) / inWindow.length };
  });
}

/** Snittintag (kcal) för loggade dagar i de senaste `windowDays` dagarna fram till `today`. */
export function averageKcal(
  days: readonly DailyIntake[],
  today: string,
  windowDays = 7,
): { kcal: number; days: number } | null {
  const from = addDays(today, -(windowDays - 1));
  const inWindow = days.filter((d) => d.date >= from && d.date <= today);
  if (inWindow.length === 0) return null;
  return {
    kcal: inWindow.reduce((s, d) => s + d.kcal, 0) / inWindow.length,
    days: inWindow.length,
  };
}
