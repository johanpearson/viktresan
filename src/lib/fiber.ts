/**
 * Fibermål (NNR 2023) med gradvis upptrappning, fiber per dag ur matloggen och
 * fiberrika livsmedel. Rena funktioner utan I/O.
 *
 * Fiber finns för Livsmedelsverkets livsmedel (även som ingredienser i måltider och
 * recept), för Open Food Facts-produkter som har värdet och för egna livsmedel där det
 * fyllts i. Snabbloggar och poster utan fiberdata räknas inte – dagens fiber kan då vara
 * i underkant (`missingEntries`).
 */
import { FIBER_REFERENCE_G, FIBER_REFERENCE_UNKNOWN_SEX_G } from '../data/fiberReference.ts';
import type { ExtraNutrients } from '../data/nutrients.ts';
import type { FoodLogEntry, SavedMeal } from '../db/db.ts';
import { daysBetween } from './dates.ts';
import type { Sex } from './energy.ts';
import { formatInt } from './format.ts';
import { partsOf } from './mealAnalysis.ts';

/** Startvärde för upptrappningen när det saknas fiberdata. */
export const FIBER_RAMP_DEFAULT_START_G = 15;
/** Upptrappningen höjer veckans mål med så här många gram per vecka. */
export const FIBER_RAMP_STEP_G = 3;
/** Startvärdet = snittet av så här många senast loggade dagar. */
export const FIBER_RAMP_WINDOW_DAYS = 7;
/** Minst så här många gram fiber per 100 kcal räknas som fiberrikt. */
export const FIBER_RICH_G_PER_100_KCAL = 3;

/** Referensvärdet per dag för ett kön (NNR 2023), 30 g utan kön. */
export function fiberReferenceG(sex: Sex | undefined): number {
  return sex ? FIBER_REFERENCE_G[sex] : FIBER_REFERENCE_UNKNOWN_SEX_G;
}

/** Upptrappningens början: dagen och veckans mål den veckan. */
export interface FiberRampStart {
  date: string;
  startG: number;
}

export interface FiberProfile {
  sex?: Sex | undefined;
  /** Visa fibermålet även utan GLP-1. */
  showFiberGoal?: boolean;
  /** `false` = gå direkt på referensvärdet. Saknas → upptrappning. */
  fiberRamp?: boolean;
  fiberRampStart?: FiberRampStart;
}

/** Fibermålet visas automatiskt med GLP-1, annars om användaren slagit på det. */
export function fiberGoalVisible(profile: FiberProfile | null, glp1Enabled: boolean): boolean {
  return profile !== null && (glp1Enabled || profile.showFiberGoal === true);
}

/** Upptrappningen är på som standard. */
export function fiberRampEnabled(profile: FiberProfile | null): boolean {
  return profile?.fiberRamp !== false;
}

export interface DatedFiber {
  date: string;
  fiberG: number;
}

/**
 * Upptrappningens startvärde: snittet av de senaste 7 loggade dagarna med fiberdata
 * före `today` (dagen är inte slut), avrundat till hela gram och högst referensvärdet.
 * Utan data: 15 g (eller referensvärdet om det är lägre).
 */
export function rampStartG(days: readonly DatedFiber[], today: string, referenceG: number): number {
  const logged = days
    .filter((d) => d.date < today && d.fiberG > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, FIBER_RAMP_WINDOW_DAYS);
  if (logged.length === 0) return Math.min(FIBER_RAMP_DEFAULT_START_G, referenceG);
  const mean = logged.reduce((s, d) => s + d.fiberG, 0) / logged.length;
  return Math.min(Math.round(mean), referenceG);
}

/** Veckans mål: startvärdet + 3 g per hel vecka sedan start, högst referensvärdet. */
export function weeklyFiberGoalG(start: FiberRampStart, referenceG: number, today: string): number {
  const weeks = Math.max(0, Math.floor(daysBetween(start.date, today) / 7));
  return Math.min(referenceG, start.startG + weeks * FIBER_RAMP_STEP_G);
}

export interface FiberGoal {
  /** Dagens mål i gram (veckans mål under upptrappningen). */
  goalG: number;
  /** Referensvärdet (NNR 2023) som upptrappningen slutar på. */
  referenceG: number;
  /** Upptrappningen pågår (veckans mål < referensvärdet). */
  ramping: boolean;
}

export interface FiberGoalInput {
  glp1Enabled: boolean;
  today: string;
  /**
   * Upptrappningens start när profilen ännu saknar en (den sparas första gången målet
   * visas). Utan den räknas start från idag med standardvärdet.
   */
  pendingStart?: FiberRampStart | undefined;
}

/**
 * Dagens fibermål, eller `null` när målet inte visas (varken GLP-1 eller "Visa fibermål").
 * Med upptrappning: veckans mål; annars referensvärdet direkt.
 */
export function fiberGoal(profile: FiberProfile | null, input: FiberGoalInput): FiberGoal | null {
  if (!profile || !fiberGoalVisible(profile, input.glp1Enabled)) return null;
  const referenceG = fiberReferenceG(profile.sex);
  if (!fiberRampEnabled(profile)) return { goalG: referenceG, referenceG, ramping: false };
  const start = profile.fiberRampStart ??
    input.pendingStart ?? {
      date: input.today,
      startG: Math.min(FIBER_RAMP_DEFAULT_START_G, referenceG),
    };
  const goalG = weeklyFiberGoalG(start, referenceG, input.today);
  return { goalG, referenceG, ramping: goalG < referenceG };
}

/** "Veckans fibermål: 21 g (mål 35 g)" under upptrappningen, annars "Fibermål: 35 g per dag". */
export function fiberGoalText(goal: FiberGoal): string {
  return goal.ramping
    ? `Veckans fibermål: ${formatInt(goal.goalG)} g (mål ${formatInt(goal.referenceG)} g)`
    : `Fibermål: ${formatInt(goal.referenceG)} g per dag`;
}

// ---------------------------------------------------------------------------
// Fiber ur matloggen

/** Fiber per 100 g (eller ml) per livsmedels-id – Livsmedelsverket, egna och OFF. */
export interface FiberSource {
  meals: readonly SavedMeal[];
  lookup: (foodId: string) => ExtraNutrients | null | undefined;
}

export interface FiberTotal {
  fiberG: number;
  /** Poster som helt eller delvis saknar fiberdata (snabbloggar, OFF utan värdet …). */
  missingEntries: number;
  entries: number;
}

/** Fiber i posterna. Delar utan värde räknas som 0 och posten räknas som ofullständig. */
export function fiberOfEntries(entries: readonly FoodLogEntry[], source: FiberSource): FiberTotal {
  let fiberG = 0;
  let missingEntries = 0;
  for (const entry of entries) {
    if (entry.estimated) {
      missingEntries += 1;
      continue;
    }
    let missing = false;
    for (const part of partsOf(entry, source.meals, source.lookup)) {
      const value = part.extra?.fiberG;
      if (value === undefined) missing = true;
      else fiberG += (value * part.grams) / 100;
    }
    if (missing) missingEntries += 1;
  }
  return { fiberG, missingEntries, entries: entries.length };
}

export interface DayFiber extends FiberTotal {
  date: string;
}

/** Fiber per dag (bara dagar med matlogg), äldst först. */
export function dailyFiber(foodLog: readonly FoodLogEntry[], source: FiberSource): DayFiber[] {
  const byDate = new Map<string, FoodLogEntry[]>();
  for (const e of foodLog) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, entries]) => ({ date, ...fiberOfEntries(entries, source) }));
}

/** Fiberrikt = minst 3 g fiber per 100 kcal. Livsmedel utan energi eller fiberdata räknas inte. */
export function isFiberRich(food: {
  per100: { kcal: number };
  extra?: { fiberG?: number } | undefined;
}): boolean {
  const fiber = food.extra?.fiberG;
  if (fiber === undefined || !(food.per100.kcal > 0) || !(fiber > 0)) return false;
  return (fiber / food.per100.kcal) * 100 >= FIBER_RICH_G_PER_100_KCAL;
}
