/**
 * Stöd för vad man kan äta (Mat → Dag): gapraden ("41 g protein och 6 g fiber kvar"), etiketterna
 * som sök-sheeten visar först när ett gap är stort, och underlaget till "Vad ska jag äta?"
 * (en AI-prompt som användaren själv delar). Rena funktioner utan I/O.
 */
import type { ClaimId } from '../data/nutritionClaims.ts';
import type { FoodLogEntry } from '../db/db.ts';
import type { AiSubject } from './aiPrompt.ts';
import { addDays } from './dates.ts';
import { formatInt } from './format.ts';
import type { MealId, MealSlot } from './mealSlots.ts';
import { scaleNutrients } from './nutrition.ts';

/** Ett gap visas när mer än så här stor andel av målet återstår. */
export const GAP_SHARE = 0.1;
/** Fönstret för typisk måltid och vanliga livsmedel. */
export const HISTORY_DAYS = 28;
/** Så många livsmedel tas med som "brukar finnas hemma". */
export const HOME_FOODS = 20;
/** Måltidens typiska kcal räknas först med så här många dagar i fönstret. */
const MIN_TYPICAL_DAYS = 3;

export interface Goals {
  targetKcal: number | null;
  proteinGoalG: number | null;
  /** Dagens fibermål (veckans mål under upptrappningen, annars referensvärdet). */
  fiberGoalG: number | null;
}

/** Dagens intag hittills. `fiberG` = känd fiber, `null` medan fiberdatan laddas. */
export interface Eaten {
  kcal: number;
  proteinG: number;
  fiberG: number | null;
}

export type GapNutrient = 'protein' | 'fiber';

export interface Gap {
  nutrient: GapNutrient;
  /** Gram kvar till målet, aldrig negativt. */
  grams: number;
  /** Andel av målet som återstår, 0–1. */
  share: number;
}

function gapOf(nutrient: GapNutrient, eaten: number | null, goal: number | null): Gap | null {
  if (eaten === null || goal === null || !(goal > 0)) return null;
  const grams = Math.max(0, goal - eaten);
  return { nutrient, grams, share: Math.min(1, grams / goal) };
}

/** Gap med mer än 10 % kvar av målet, störst andel först. */
export function largeGaps(eaten: Eaten, goals: Goals): Gap[] {
  return [
    gapOf('protein', eaten.proteinG, goals.proteinGoalG),
    gapOf('fiber', eaten.fiberG, goals.fiberGoalG),
  ]
    .filter((g): g is Gap => g !== null && g.share > GAP_SHARE)
    .sort((a, b) => b.share - a.share);
}

/** Gapraden: "41 g protein och 6 g fiber kvar", `null` när allt är inom 10 % av målet. */
export function gapText(gaps: readonly Gap[]): string | null {
  if (gaps.length === 0) return null;
  return `${gaps.map((g) => `${formatInt(Math.round(g.grams))} g ${g.nutrient}`).join(' och ')} kvar`;
}

const GAP_CLAIMS: Record<GapNutrient, ClaimId> = { protein: 'proteinrik', fiber: 'fiberrik' };

/** Etiketterna som sök-sheeten visar först (inte förvalda) när protein- eller fibergapet är stort. */
export function gapClaims(gaps: readonly Gap[]): ClaimId[] {
  return gaps.map((g) => GAP_CLAIMS[g.nutrient]);
}

/** Loggar som räknas: inte snabbloggar (bara uppskattade kcal) och inte idag (dagen är inte slut). */
function recentEntries(log: readonly FoodLogEntry[], today: string): FoodLogEntry[] {
  const from = addDays(today, -HISTORY_DAYS);
  return log.filter(
    (e) => e.date >= from && e.date < today && !e.estimated && !e.foodId.startsWith('snabb:'),
  );
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? hi : ((sorted[mid - 1] ?? hi) + hi) / 2;
}

/**
 * Måltidens typiska kcal: medianen av måltidens summa per dag de senaste 28 dagarna (dagar med
 * något loggat i måltiden). `null` med färre än 3 sådana dagar.
 */
export function typicalMealKcal(
  log: readonly FoodLogEntry[],
  slot: MealId,
  today: string,
): number | null {
  const byDate = new Map<string, number>();
  for (const e of recentEntries(log, today)) {
    if (e.meal !== slot) continue;
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + scaleNutrients(e.per100, e.grams).kcal);
  }
  return byDate.size >= MIN_TYPICAL_DAYS ? Math.round(median([...byDate.values()])) : null;
}

/**
 * De vanligaste livsmedlen de senaste 28 dagarna ("brukar finnas hemma"): livsmedel (inte
 * måltider, recept eller snabbloggar, inte dolda i matsökningen), flest loggar först, sedan
 * senast loggat.
 */
export function commonFoods(
  log: readonly FoodLogEntry[],
  today: string,
  limit = HOME_FOODS,
  hidden: ReadonlySet<string> = new Set(),
): string[] {
  const counts = new Map<string, { name: string; n: number; last: number }>();
  for (const e of recentEntries(log, today)) {
    if (/^(maltid|recept):/.test(e.foodId) || hidden.has(e.foodId)) continue;
    const prev = counts.get(e.foodId);
    counts.set(e.foodId, {
      name: e.name,
      n: (prev?.n ?? 0) + 1,
      last: Math.max(prev?.last ?? 0, e.createdAt),
    });
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || b.last - a.last)
    .slice(0, limit)
    .map((c) => c.name);
}

/** Underlaget till "Vad ska jag äta?": måltiden, det som är kvar idag, typisk portion och vanliga livsmedel. */
export function whatToEatSubject(input: {
  /** Måltiden ur inställningen – namnet i prompten, id:t för typisk kcal. */
  meal: Pick<MealSlot, 'id' | 'name'>;
  today: string;
  log: readonly FoodLogEntry[];
  eaten: Eaten;
  goals: Goals;
  /** Dolda livsmedel (matsökningen) – nämns aldrig som "brukar finnas hemma". */
  hidden?: ReadonlySet<string>;
}): AiSubject {
  const { meal, today, log, eaten, goals, hidden } = input;
  return {
    kind: 'eat',
    meal: meal.name,
    remaining: {
      kcal: goals.targetKcal === null ? null : goals.targetKcal - eaten.kcal,
      proteinG: goals.proteinGoalG === null ? null : goals.proteinGoalG - eaten.proteinG,
      fiberG:
        goals.fiberGoalG === null || eaten.fiberG === null ? null : goals.fiberGoalG - eaten.fiberG,
    },
    typicalKcal: typicalMealKcal(log, meal.id, today),
    homeFoods: commonFoods(log, today, HOME_FOODS, hidden),
  };
}
