/**
 * Näringssummering: vitaminer och mineraler per dag från mat och tillskott, mot
 * referensintaget (RI) och EFSA:s övre gränsvärden (UL). Rena funktioner utan I/O.
 *
 * Matens värden finns bara för Livsmedelsverkets livsmedel (även som ingredienser i
 * sparade måltider). Egna livsmedel och produkter från Open Food Facts saknar dem, så
 * totalen kan bli i underkant – `partsWithoutData` säger hur många delar det gäller.
 */
import type { NutrientGroup, NutrientKey, NutrientUnit } from '../data/nutrients.ts';
import { upperLimitFor, type UpperLimit } from '../data/upperLimits.ts';
import type { FoodLogEntry, SavedMeal, SupplementIntake } from '../db/db.ts';
import { addDays } from './dates.ts';
import { partsOf, type ExtraLookup } from './mealAnalysis.ts';
import { SUPPLEMENT_NUTRIENTS } from './nutrientUnits.ts';
import { intakeAmounts } from './supplements.ts';

export type IntakeSource = 'mat' | 'tillskott';

export interface Contributor {
  name: string;
  source: IntakeSource;
  amount: number;
}

export interface NutrientDayRow {
  key: NutrientKey;
  label: string;
  unit: NutrientUnit;
  group: NutrientGroup;
  ri: number | null;
  food: number;
  supplements: number;
  total: number;
  /** Största bidragen först. */
  contributors: Contributor[];
}

export interface DayNutrition {
  rows: NutrientDayRow[];
  /** Delar av matloggen (poster, ingredienser i loggade måltider). */
  foodParts: number;
  /** Delar utan vitamin- och mineraldata (egna, Open Food Facts). */
  partsWithoutData: number;
  /** Tagna tillskott. */
  supplementCount: number;
  /** Dagar med något loggat (1 eller 0 för en dag, upp till 7 för ett snitt). */
  loggedDays: number;
}

export interface NutritionInput {
  foodLog: readonly FoodLogEntry[];
  meals: readonly SavedMeal[];
  lookup: ExtraLookup;
  supplementLog: readonly SupplementIntake[];
}

function add(map: Map<string, Contributor>, c: Contributor) {
  const id = `${c.source}:${c.name}`;
  const existing = map.get(id);
  if (existing) existing.amount += c.amount;
  else map.set(id, { ...c });
}

/** Summerar en dags mat och tillskott per vitamin och mineral. */
export function dayNutrition(date: string, input: NutritionInput): DayNutrition {
  const entries = input.foodLog.filter((e) => e.date === date);
  const intakes = input.supplementLog.filter((e) => e.date === date);
  const contributors = new Map<NutrientKey, Map<string, Contributor>>();
  const food = new Map<NutrientKey, number>();
  const supplements = new Map<NutrientKey, number>();
  let foodParts = 0;
  let partsWithoutData = 0;

  for (const entry of entries) {
    const parts = partsOf(entry, input.meals, input.lookup);
    foodParts += parts.length;
    partsWithoutData += parts.filter((p) => p.extra === null).length;
    for (const info of SUPPLEMENT_NUTRIENTS) {
      let amount = 0;
      for (const part of parts) amount += ((part.extra?.[info.key] ?? 0) * part.grams) / 100;
      if (amount <= 0) continue;
      food.set(info.key, (food.get(info.key) ?? 0) + amount);
      const map = contributors.get(info.key) ?? new Map<string, Contributor>();
      add(map, { name: entry.name, source: 'mat', amount });
      contributors.set(info.key, map);
    }
  }
  for (const intake of intakes) {
    for (const [key, amount] of intakeAmounts(intake)) {
      if (amount <= 0) continue;
      supplements.set(key, (supplements.get(key) ?? 0) + amount);
      const map = contributors.get(key) ?? new Map<string, Contributor>();
      add(map, { name: intake.name, source: 'tillskott', amount });
      contributors.set(key, map);
    }
  }

  const rows = SUPPLEMENT_NUTRIENTS.map((info): NutrientDayRow => {
    const f = food.get(info.key) ?? 0;
    const s = supplements.get(info.key) ?? 0;
    return {
      key: info.key,
      label: info.label,
      unit: info.unit,
      group: info.group,
      ri: info.ri,
      food: f,
      supplements: s,
      total: f + s,
      contributors: [...(contributors.get(info.key)?.values() ?? [])].sort(
        (a, b) => b.amount - a.amount,
      ),
    };
  });
  return {
    rows,
    foodParts,
    partsWithoutData,
    supplementCount: intakes.length,
    loggedDays: entries.length > 0 || intakes.length > 0 ? 1 : 0,
  };
}

/**
 * Snitt per loggad dag över de sju dagarna som slutar med `date` (samma princip som
 * övriga snitt i appen: dagar utan något loggat räknas inte).
 */
export function weekNutrition(date: string, input: NutritionInput): DayNutrition {
  const days = Array.from({ length: 7 }, (_, i) => dayNutrition(addDays(date, i - 6), input));
  const logged = days.filter((d) => d.loggedDays > 0);
  const n = logged.length;
  const rows = SUPPLEMENT_NUTRIENTS.map((info, index): NutrientDayRow => {
    const map = new Map<string, Contributor>();
    let f = 0;
    let s = 0;
    for (const day of logged) {
      const row = day.rows[index];
      if (!row) continue;
      f += row.food;
      s += row.supplements;
      for (const c of row.contributors) add(map, c);
    }
    const divide = (v: number) => (n > 0 ? v / n : 0);
    return {
      key: info.key,
      label: info.label,
      unit: info.unit,
      group: info.group,
      ri: info.ri,
      food: divide(f),
      supplements: divide(s),
      total: divide(f + s),
      contributors: [...map.values()]
        .map((c) => ({ ...c, amount: divide(c.amount) }))
        .sort((a, b) => b.amount - a.amount),
    };
  });
  return {
    rows,
    foodParts: logged.reduce((sum, d) => sum + d.foodParts, 0),
    partsWithoutData: logged.reduce((sum, d) => sum + d.partsWithoutData, 0),
    supplementCount: logged.reduce((sum, d) => sum + d.supplementCount, 0),
    loggedDays: n,
  };
}

export interface UpperLimitWarning {
  key: NutrientKey;
  label: string;
  unit: NutrientUnit;
  limit: UpperLimit;
  /** Det som jämförs med gränsen (mat + tillskott, eller bara tillskott). */
  amount: number;
  /** De största bidragen (högst tre) till det som jämförs. */
  top: Contributor[];
}

/** Näringsämnen där intaget överstiger EFSA:s övre gräns. */
export function upperLimitWarnings(day: DayNutrition): UpperLimitWarning[] {
  const warnings: UpperLimitWarning[] = [];
  for (const row of day.rows) {
    const limit = upperLimitFor(row.key);
    if (!limit) continue;
    const onlySupplements = limit.appliesTo === 'supplements';
    const amount = onlySupplements ? row.supplements : row.total;
    if (amount <= limit.ul) continue;
    warnings.push({
      key: row.key,
      label: row.label,
      unit: row.unit,
      limit,
      amount,
      top: row.contributors.filter((c) => !onlySupplements || c.source === 'tillskott').slice(0, 3),
    });
  }
  return warnings;
}
