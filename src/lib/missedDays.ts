/**
 * Dagar utan matlogg (Översikt → Att göra idag): "Ingen mat loggad igår" med valen Som vanligt
 * (uppskattad dag ur de typiska måltiderna), Fyll i och Hoppa över. Rena funktioner utan I/O.
 */
import type { FoodLogEntry } from '../db/db.ts';
import { addDays, toDayNumber } from './dates.ts';
import { formatDayMonth } from './format.ts';
import { sortMealSlots, type MealId, type MealSlot } from './mealSlots.ts';
import { quickEntry } from './quickLog.ts';
import { typicalMeal } from './whatToEat.ts';

/** Så många dagar bakåt (före idag) letas dagar utan matlogg. */
export const MISSED_DAYS_BACK = 7;

/** Raderna visas bara för den som loggar mat: något loggat de senaste 14 dagarna. */
const ACTIVE_DAYS = 14;

/** "Hoppa över" sparas så här länge (sedan är dagen utanför fönstret ändå). */
const SKIPPED_KEEP_DAYS = 14;

/** Namnet på posterna som "Som vanligt" lägger in. */
export const USUAL_NAME = 'Som vanligt';

/**
 * Dagar de senaste `MISSED_DAYS_BACK` dagarna (före idag) utan matlogg, senast först. Inte före
 * första loggade dagen, inte dagar som hoppats över och inget alls om ingen mat loggats på två
 * veckor (då används Mat inte just nu).
 */
export function missedFoodDays(
  log: readonly Pick<FoodLogEntry, 'date'>[],
  today: string,
  skipped: readonly string[],
): string[] {
  const dates = new Set(log.map((e) => e.date));
  let first: string | null = null;
  for (const d of dates) if (first === null || d < first) first = d;
  const activeFrom = addDays(today, -ACTIVE_DAYS);
  if (first === null || ![...dates].some((d) => d >= activeFrom && d <= today)) return [];
  const result: string[] = [];
  for (let i = 1; i <= MISSED_DAYS_BACK; i++) {
    const date = addDays(today, -i);
    if (date < first) break;
    if (!dates.has(date) && !skipped.includes(date)) result.push(date);
  }
  return result;
}

/** De hoppade dagarna med `date` tillagd, utan dagar äldre än två veckor. */
export function withSkipped(skipped: readonly string[], date: string, today: string): string[] {
  const from = addDays(today, -SKIPPED_KEEP_DAYS);
  return [...new Set([...skipped, date])].filter((d) => d >= from).sort();
}

export interface UsualMeal {
  meal: MealId;
  kcal: number;
  proteinG: number;
}

/**
 * En vanlig dag: varje måltid (i dagens ordning) med typiskt kcal och protein de senaste
 * 28 dagarna. Måltider med för lite underlag (färre än 3 dagar) är inte med; tom lista = för
 * lite data för "Som vanligt".
 */
export function usualDay(
  log: readonly FoodLogEntry[],
  slots: readonly MealSlot[],
  today: string,
): UsualMeal[] {
  return sortMealSlots(slots).flatMap((slot) => {
    const typical = typicalMeal(log, slot.id, today);
    return typical && typical.kcal > 0 ? [{ meal: slot.id, ...typical }] : [];
  });
}

/** Summan av en vanlig dag (kcal). */
export function usualKcal(meals: readonly UsualMeal[]): number {
  return meals.reduce((s, m) => s + m.kcal, 0);
}

/** Matloggposterna för "Som vanligt": en uppskattad post per måltid, märkt `usual`. */
export function usualEntries(
  meals: readonly UsualMeal[],
  date: string,
  newId: () => string,
  now = Date.now(),
): FoodLogEntry[] {
  return meals.map((m, i) => ({
    ...quickEntry(
      { name: USUAL_NAME, kcal: m.kcal, proteinG: m.proteinG },
      // Strikt växande tider så att posterna behåller måltidernas ordning.
      { id: newId(), date, meal: m.meal, now: now + i },
    ),
    usual: true,
  }));
}

const WEEKDAYS = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];

/** "igår" eller "lör 17 okt". */
export function missedDayText(date: string, today: string): string {
  if (date === addDays(today, -1)) return 'igår';
  const weekday = WEEKDAYS[(((toDayNumber(date) + 3) % 7) + 7) % 7] ?? '';
  return `${weekday} ${formatDayMonth(date)}`;
}
