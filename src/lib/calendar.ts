/** Rena hjälpare för Kalender: månadsrutnät och vad som loggats per dag. */
import { addDays, toDayNumber } from './dates.ts';
import type { DoseItem } from './glp1.ts';
import { dailyIntake, type DatedPortion } from './nutrition.ts';
import { dailySteps, dailyWeights, type DatedSteps } from './stats.ts';
import { dailyWater, type DatedWater } from './water.ts';
import { displayStatus, type DisplayStatus, type WorkoutItem } from './workouts.ts';

/** Månad som "YYYY-MM". */
export type Month = string;

export function monthOf(iso: string): Month {
  return iso.slice(0, 7);
}

export function shiftMonth(month: Month, delta: number): Month {
  const [y = 1970, m = 1] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, '0')}-${String(index - year * 12 + 1).padStart(2, '0')}`;
}

/** 0 = måndag … 6 = söndag. 1970-01-01 var en torsdag. */
export function weekdayIndex(iso: string): number {
  return (((toDayNumber(iso) + 3) % 7) + 7) % 7;
}

/**
 * Månadens veckor, måndag först. Dagar utanför månaden är `null` så att varje
 * vecka har sju celler.
 */
export function monthGrid(month: Month): (string | null)[][] {
  const first = `${month}-01`;
  const cells: (string | null)[] = Array<null>(weekdayIndex(first)).fill(null);
  for (let day = first; monthOf(day) === month; day = addDays(day, 1)) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const monthFormat = new Intl.DateTimeFormat('sv-SE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-09" → "september 2026". */
export function formatMonth(month: Month): string {
  return monthFormat.format(new Date(toDayNumber(`${month}-01`) * 86_400_000));
}

/** Veckan (måndag–söndag) som innehåller datumet. */
export function weekOf(iso: string): string[] {
  const monday = addDays(iso, -weekdayIndex(iso));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Första och sista datum i månadens rutnät (hela veckor). */
export function monthRange(month: Month): { from: string; to: string } {
  const first = `${month}-01`;
  const from = addDays(first, -weekdayIndex(first));
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  return { from, to: addDays(last, 6 - weekdayIndex(last)) };
}

export interface DayWorkout {
  item: WorkoutItem;
  status: DisplayStatus;
}

/** Det som loggats (eller planerats) en dag. Saknat fält = inget. */
export interface DayLog {
  weightKg?: number;
  waistCm?: number;
  steps?: number;
  kcal?: number;
  photos?: number;
  waterMl?: number;
  workouts?: DayWorkout[];
  /** GLP-1: loggade och planerade doser. */
  doses?: DoseItem[];
  /** GLP-1: aptit och biverkningar. */
  symptoms?: { appetite?: number; sideEffects: string[] };
}

export interface DayIndexInput {
  weights: readonly { date: string; weightKg: number }[];
  waist: readonly { date: string; waistCm: number }[];
  steps: readonly DatedSteps[];
  foodLog: readonly DatedPortion[];
  photoDates: readonly string[];
  water?: readonly DatedWater[];
  /** Sparade och genererade pass (se `workoutsBetween`) för de dagar som visas. */
  workouts?: readonly WorkoutItem[];
  /** Loggade och planerade doser (se `dosesBetween`) för de dagar som visas. */
  doses?: readonly DoseItem[];
  symptoms?: readonly { date: string; appetite?: number; sideEffects: string[] }[];
  /** Avgör om planerade pass är obesvarade. */
  now?: Date;
}

export function buildDayIndex(input: DayIndexInput): Map<string, DayLog> {
  const index = new Map<string, DayLog>();
  const day = (date: string): DayLog => {
    let entry = index.get(date);
    if (!entry) {
      entry = {};
      index.set(date, entry);
    }
    return entry;
  };
  for (const w of dailyWeights(input.weights)) day(w.date).weightKg = w.weightKg;
  for (const w of input.waist) day(w.date).waistCm = w.waistCm;
  for (const s of dailySteps(input.steps)) day(s.date).steps = s.steps;
  for (const f of dailyIntake(input.foodLog)) day(f.date).kcal = f.kcal;
  for (const date of input.photoDates) {
    const entry = day(date);
    entry.photos = (entry.photos ?? 0) + 1;
  }
  for (const w of dailyWater(input.water ?? [])) day(w.date).waterMl = w.ml;
  const now = input.now ?? new Date();
  for (const item of input.workouts ?? []) {
    const entry = day(item.date);
    (entry.workouts ??= []).push({ item, status: displayStatus(item, now) });
  }
  for (const dose of input.doses ?? []) (day(dose.date).doses ??= []).push(dose);
  for (const s of input.symptoms ?? []) {
    day(s.date).symptoms =
      s.appetite == null
        ? { sideEffects: s.sideEffects }
        : { appetite: s.appetite, sideEffects: s.sideEffects };
  }
  return index;
}
