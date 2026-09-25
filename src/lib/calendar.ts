/** Rena hjälpare för Kalender: månadsrutnät och vad som loggats per dag. */
import { addDays, toDayNumber } from './dates.ts';
import { dailyIntake, type DatedPortion } from './nutrition.ts';
import { dailySteps, dailyWeights, type DatedSteps } from './stats.ts';

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

/** Det som loggats en dag. Saknat fält = inget loggat. */
export interface DayLog {
  weightKg?: number;
  waistCm?: number;
  steps?: number;
  kcal?: number;
  photos?: number;
}

export interface DayIndexInput {
  weights: readonly { date: string; weightKg: number }[];
  waist: readonly { date: string; waistCm: number }[];
  steps: readonly DatedSteps[];
  foodLog: readonly DatedPortion[];
  photoDates: readonly string[];
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
  return index;
}
