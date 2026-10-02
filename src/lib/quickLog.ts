/**
 * Snabblogg: bara uppskattade kalorier (och ev. protein) med ett valfritt namn –
 * restaurang, middag hos vänner. Rena funktioner utan I/O.
 *
 * En snabblogg är en vanlig matloggpost med `estimated: true`. Värdena ligger i
 * `per100` med mängden 1 portion = 100 "gram", så att alla summeringar räknar dem
 * utan specialfall. Livsmedels-id:t (`snabb:<namn>:<kcal>:<protein>`) är samma för
 * samma namn och värden, så att upprepade snabbloggar blir ett val under Senaste och
 * kan favoritmarkeras.
 */
import type { FoodLogEntry } from '../db/db.ts';
import { normalize, type FoodItem } from './foodSearch.ts';
import { formatGrams, formatKcal, parseDecimal } from './format.ts';
import type { MealId } from './mealSlots.ts';
import type { Nutrients } from './nutrition.ts';
import { PORTION_UNIT } from './recipes.ts';
import type { Parsed } from './validation.ts';

export const QUICK_PREFIX = 'snabb:';
export const QUICK_DEFAULT_NAME = 'Snabblogg';
export const QUICK_NAME_MAX = 60;
export const QUICK_KCAL_MAX = 10_000;
export const QUICK_PROTEIN_MAX = 500;
/** "Gram" för en snabblogg: värdena i `per100` gäller hela posten. */
export const QUICK_GRAMS = 100;

export function isQuickId(foodId: string): boolean {
  return foodId.startsWith(QUICK_PREFIX);
}

export interface QuickValues {
  name: string;
  kcal: number;
  /** `null` = inte angivet. */
  proteinG: number | null;
}

export function quickFoodId(values: QuickValues): string {
  const name = normalize(values.name).replace(/\s+/g, '-') || 'snabblogg';
  const protein = values.proteinG == null ? '' : String(Math.round(values.proteinG));
  return `${QUICK_PREFIX}${name}:${String(Math.round(values.kcal))}:${protein}`;
}

export function quickPer100(values: QuickValues): Nutrients {
  return { kcal: values.kcal, proteinG: values.proteinG ?? 0, carbsG: 0, fatG: 0 };
}

/** Tolkar formuläret: namn (valfritt), kcal (1–10 000) och protein (valfritt, 0–500 g). */
export function parseQuick(input: {
  name: string;
  kcal: string;
  protein: string;
}): Parsed<QuickValues> {
  const name = input.name.trim() || QUICK_DEFAULT_NAME;
  if (name.length > QUICK_NAME_MAX) {
    return { ok: false, error: `Namnet får vara högst ${String(QUICK_NAME_MAX)} tecken.` };
  }
  const kcal = parseDecimal(input.kcal);
  if (kcal == null || kcal < 1 || kcal > QUICK_KCAL_MAX) {
    return { ok: false, error: 'Ange ungefär hur många kcal (1–10 000).' };
  }
  let proteinG: number | null = null;
  if (input.protein.trim() !== '') {
    proteinG = parseDecimal(input.protein);
    if (proteinG == null || proteinG < 0 || proteinG > QUICK_PROTEIN_MAX) {
      return { ok: false, error: 'Ange protein i gram (0–500) eller lämna tomt.' };
    }
  }
  return { ok: true, value: { name, kcal: Math.round(kcal), proteinG } };
}

/** Matloggposten för en snabblogg (ny eller ändrad – `editing` behåller id och datum). */
export function quickEntry(
  values: QuickValues,
  options: {
    id: string;
    date: string;
    meal: MealId;
    now: number;
    editing?: FoodLogEntry | null;
  },
): FoodLogEntry {
  const { editing } = options;
  const entry: FoodLogEntry = {
    id: editing?.id ?? options.id,
    date: editing?.date ?? options.date,
    meal: options.meal,
    foodId: quickFoodId(values),
    name: values.name,
    amount: 1,
    unit: PORTION_UNIT,
    grams: QUICK_GRAMS,
    per100: quickPer100(values),
    estimated: true,
    createdAt: editing?.createdAt ?? options.now,
  };
  if (editing) entry.updatedAt = options.now;
  return entry;
}

/** En snabblogg (post eller snabbval) som värden i formuläret. */
export function quickValuesOf(food: { name: string; per100: Nutrients; id: string }): QuickValues {
  // Protein 0 kan vara "inte angivet" – id:t säger vilket.
  const proteinGiven = !food.id.endsWith(':');
  return {
    name: food.name,
    kcal: Math.round(food.per100.kcal),
    proteinG: proteinGiven ? food.per100.proteinG : null,
  };
}

/** "≈ 700 kcal · 35 g protein" – detaljraden för en snabblogg. */
export function quickDetail(food: Pick<FoodItem, 'per100' | 'id'>): string {
  const v = quickValuesOf({ ...food, name: '' });
  const kcal = `≈ ${formatKcal(v.kcal)}`;
  return v.proteinG == null ? kcal : `${kcal} · ${formatGrams(Math.round(v.proteinG))} protein`;
}
