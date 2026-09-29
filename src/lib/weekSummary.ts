/**
 * Veckosummering (måndag–söndag): trendförändring, snittintag, protein, fiber (med
 * fibermålet), vatten, genomförda pass och snittsteg, jämfört med veckan innan. Rena funktioner.
 */
import { weekdayIndex } from './calendar.ts';
import { addDays, toDayNumber } from './dates.ts';
import type { FeatureGated } from './features.ts';
import { formatInt, formatKcal, formatKg, formatMl, formatShortDate } from './format.ts';
import { dailyIntake, type DatedPortion } from './nutrition.ts';
import { buildPlan, type PlanProfile } from './plan.ts';
import { proteinGoalFor } from './protein.ts';
import { dailySteps, dailyWeights, emaTrend, type DatedSteps, type DatedWeight } from './stats.ts';
import {
  dailyWater,
  drinkEntries,
  waterGoal,
  type DatedWater,
  type DrinkFoodEntry,
} from './water.ts';

export interface WeekInput {
  weights: readonly DatedWeight[];
  /** Matloggen; drycker i den räknas in i dryckessnittet. */
  foodLog: readonly (DatedPortion & DrinkFoodEntry)[];
  water: readonly DatedWater[];
  workouts: readonly { date: string; status: string }[];
  steps: readonly DatedSteps[];
  profile:
    | (PlanProfile & {
        proteinFactor?: number;
        waterGoalMl?: number;
        waterGlp1BonusMl?: number;
        waterGlp1OnOwnGoal?: boolean;
      })
    | null;
  /** Fiber per matdag – bara när fibermålet är på (annars ingen fiberrad). */
  fiber?: {
    days: readonly { date: string; fiberG: number }[];
    /** Fibermålet ett datum (veckans mål i upptrappningen). */
    goalOn: (date: string) => number | null;
  } | null;
  /** GLP-1 är på – dryckesmålet får GLP-1-tillägget. */
  glp1?: boolean;
}

export interface WeekSummary {
  /** Måndag. */
  from: string;
  /** Söndag. */
  to: string;
  /** Trendvikt vid veckans slut − vid veckans början. `null` utan vägning i veckan. */
  trendChangeKg: number | null;
  /** Dagar med vägning. */
  weighDays: number;
  /** Snitt av dagsvikterna i veckan (Framsteg → Veckor), `null` utan vägning. */
  averageKg: number | null;
  /** Snitt per loggad matdag. */
  kcal: number | null;
  proteinG: number | null;
  foodDays: number;
  /** Kalorimålet som det såg ut vid veckans slut. */
  targetKcal: number | null;
  /** Veckobudget (7 × dagsmålet vid veckans slut), `null` utan kalorimål. */
  budgetKcal: number | null;
  /** Summan av loggade kcal i veckan, `null` utan matlogg. */
  weekKcal: number | null;
  proteinGoalG: number | null;
  /** Snitt per matdag, `null` utan fibermål eller matlogg. */
  fiberG: number | null;
  /** Fibermålet vid veckans slut. */
  fiberGoalG: number | null;
  /** Snitt per dag med dryck (loggad eller ur matloggen). */
  waterMl: number | null;
  waterDays: number;
  waterGoalMl: number | null;
  workoutsDone: number;
  /** Snitt per dag med steg. */
  steps: number | null;
  stepsDays: number;
  /** Dagar med minst en logg av något slag. */
  loggedDays: number;
}

/** Måndagen i veckan som innehåller datumet. */
export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

/** ISO-veckonummer för ett datum (vecka 1 innehåller årets första torsdag). */
export function isoWeekNumber(iso: string): number {
  const thursday = addDays(mondayOf(iso), 3);
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor((toDayNumber(thursday) - toDayNumber(jan1)) / 7) + 1;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

function inWeek<T extends { date: string }>(items: readonly T[], from: string, to: string): T[] {
  return items.filter((i) => i.date >= from && i.date <= to);
}

/** Summerar veckan som börjar på måndagen `from`. */
export function summarizeWeek(input: WeekInput, from: string): WeekSummary {
  const to = addDays(from, 6);
  const { profile } = input;

  // Trend: EMA över alla dagsvikter fram till veckans slut. Utgångsläget är trenden
  // dagen före veckan, eller (utan tidigare vägning) veckans första vägning.
  const daily = dailyWeights(input.weights.filter((w) => w.date <= to));
  const trend = emaTrend(daily);
  const weekTrend = inWeek(trend, from, to);
  const before = trend.filter((t) => t.date < from).at(-1);
  const end = weekTrend.at(-1);
  const start = before ?? (weekTrend.length > 1 ? weekTrend[0] : undefined);
  const trendChangeKg = end && start ? end.trendKg - start.trendKg : null;

  const intake = inWeek(dailyIntake(input.foodLog), from, to);
  const water = inWeek(dailyWater(drinkEntries(input.water, input.foodLog)), from, to);
  const steps = inWeek(dailySteps(input.steps), from, to);
  const done = inWeek(input.workouts, from, to).filter((w) => w.status === 'genomford');
  const fiberDays = input.fiber ? inWeek(input.fiber.days, from, to) : [];

  let targetKcal: number | null = null;
  if (profile) {
    const plan = buildPlan(profile, input.weights, input.foodLog, addDays(to, 1));
    if (plan.kind === 'plan') targetKcal = plan.plan.targetKcal;
  }

  const logged = new Set([
    ...weekTrend.map((d) => d.date),
    ...intake.map((d) => d.date),
    ...water.map((d) => d.date),
    ...steps.map((d) => d.date),
    ...done.map((d) => d.date),
  ]);

  return {
    from,
    to,
    trendChangeKg,
    weighDays: weekTrend.length,
    averageKg: mean(inWeek(daily, from, to).map((d) => d.weightKg)),
    kcal: mean(intake.map((d) => d.kcal)),
    proteinG: mean(intake.map((d) => d.proteinG)),
    foodDays: intake.length,
    targetKcal,
    budgetKcal: targetKcal === null ? null : Math.round(targetKcal) * 7,
    weekKcal: intake.length === 0 ? null : intake.reduce((s, d) => s + d.kcal, 0),
    proteinGoalG: proteinGoalFor(profile),
    fiberG: mean(fiberDays.map((d) => d.fiberG)),
    fiberGoalG: input.fiber ? input.fiber.goalOn(to) : null,
    waterMl: mean(water.map((d) => d.ml)),
    waterDays: water.length,
    // Målet utan träningstillägg (utan datum) men med ev. GLP-1-tillägg – snittet jämförs med
    // ett vanligt dagsmål.
    waterGoalMl: profile ? waterGoal({ profile, glp1: input.glp1 === true }).ml : null,
    workoutsDone: done.length,
    steps: mean(steps.map((d) => d.steps)),
    stepsDays: steps.length,
    loggedDays: logged.size,
  };
}

export function hasWeekData(summary: WeekSummary): boolean {
  return summary.loggedDays > 0;
}

export interface WeekEntry {
  summary: WeekSummary;
  /** Veckan innan, för jämförelsepilarna. */
  previous: WeekSummary;
}

/** Den senast avslutade veckan (föregående måndag–söndag) räknat från `today`. */
export function lastCompletedWeek(input: WeekInput, today: string): WeekEntry {
  const from = addDays(mondayOf(today), -7);
  return { summary: summarizeWeek(input, from), previous: summarizeWeek(input, addDays(from, -7)) };
}

function earliestDate(input: WeekInput): string | null {
  let min: string | null = null;
  for (const list of [input.weights, input.foodLog, input.water, input.workouts, input.steps]) {
    for (const item of list) if (min === null || item.date < min) min = item.date;
  }
  return min;
}

/**
 * Avslutade veckor med data, senaste först (Framsteg → Veckor). Veckor utan
 * någon logg hoppas över; jämförelsen görs alltid mot kalenderveckan innan.
 */
export function pastWeeks(input: WeekInput, today: string, maxWeeks = 52): WeekEntry[] {
  const first = earliestDate(input);
  if (first === null) return [];
  const firstMonday = mondayOf(first);
  const result: WeekEntry[] = [];
  let from = addDays(mondayOf(today), -7);
  let summary = from >= firstMonday ? summarizeWeek(input, from) : null;
  for (let i = 0; summary && i < maxWeeks; i++) {
    const prevFrom = addDays(from, -7);
    const previous = summarizeWeek(input, prevFrom);
    if (hasWeekData(summary)) result.push({ summary, previous });
    from = prevFrom;
    summary = from >= firstMonday ? previous : null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Presentation

export type Direction = 'up' | 'down' | 'same';

/** Riktning jämfört med veckan innan. `null` om något av värdena saknas. */
export function compareValues(
  current: number | null,
  previous: number | null,
  tolerance: number,
): Direction | null {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  if (Math.abs(diff) <= tolerance) return 'same';
  return diff > 0 ? 'up' : 'down';
}

export interface WeekRow extends FeatureGated {
  id: 'trend' | 'budget' | 'kcal' | 'protein' | 'fiber' | 'vatten' | 'traning' | 'steg';
  label: string;
  /** Värdet som jämförs mellan veckorna. */
  value: (s: WeekSummary) => number | null;
  /** Skillnader inom toleransen räknas som oförändrat. */
  tolerance: number;
  /** Text för veckans värde, `null` om inget loggats. */
  text: (s: WeekSummary) => string | null;
}

function ofGoal(value: string, goal: string | null): string {
  return goal ? `${value} (mål ${goal})` : value;
}

function daysText(days: number): string {
  return days === 1 ? '1 dag' : `${String(days)} dagar`;
}

/** Raderna på veckokortet, i visningsordning. Filtreras med funktionsbrytarna. */
export const WEEK_ROWS: readonly WeekRow[] = [
  {
    id: 'trend',
    label: 'Trendvikt',
    value: (s) => s.trendChangeKg,
    tolerance: 0.05,
    text: (s) => (s.trendChangeKg == null ? null : formatKg(s.trendChangeKg, { signed: true })),
  },
  {
    // Budget mot utfall: veckans loggade kcal mot 7 × dagsmålet. Dagar utan matlogg räknas
    // som 0 kcal och syns i dagantalet.
    id: 'budget',
    label: 'Veckobudget',
    feature: 'mat',
    value: (s) => s.weekKcal,
    tolerance: 50,
    text: (s) => {
      if (s.budgetKcal == null || s.weekKcal == null) return null;
      const diff = Math.round(s.weekKcal - s.budgetKcal);
      const vs =
        Math.abs(diff) < 1
          ? 'enligt budget'
          : `${formatKcal(Math.abs(diff))} ${diff < 0 ? 'under' : 'över'}`;
      return `${formatKcal(s.weekKcal)} av ${formatKcal(s.budgetKcal)} · ${vs} · ${daysText(s.foodDays)} loggade`;
    },
  },
  {
    id: 'kcal',
    label: 'Snittintag',
    feature: 'mat',
    value: (s) => s.kcal,
    tolerance: 10,
    text: (s) =>
      s.kcal == null
        ? null
        : `${ofGoal(formatKcal(s.kcal), s.targetKcal == null ? null : formatKcal(s.targetKcal))} · ${daysText(s.foodDays)}`,
  },
  {
    id: 'protein',
    label: 'Protein',
    feature: 'mat',
    value: (s) => s.proteinG,
    tolerance: 1,
    text: (s) =>
      s.proteinG == null
        ? null
        : ofGoal(
            `${formatInt(Math.round(s.proteinG))} g`,
            s.proteinGoalG == null ? null : `${formatInt(s.proteinGoalG)} g`,
          ),
  },
  {
    id: 'fiber',
    label: 'Fiber',
    feature: 'mat',
    value: (s) => s.fiberG,
    tolerance: 1,
    text: (s) =>
      s.fiberG == null
        ? null
        : ofGoal(
            `${formatInt(Math.round(s.fiberG))} g`,
            s.fiberGoalG == null ? null : `${formatInt(s.fiberGoalG)} g`,
          ),
  },
  {
    id: 'vatten',
    label: 'Dryck',
    feature: 'vatten',
    value: (s) => s.waterMl,
    tolerance: 50,
    text: (s) =>
      s.waterMl == null
        ? null
        : `${ofGoal(formatMl(s.waterMl), s.waterGoalMl == null ? null : formatMl(s.waterGoalMl))} · ${daysText(s.waterDays)}`,
  },
  {
    id: 'traning',
    label: 'Genomförda pass',
    feature: 'traning',
    value: (s) => s.workoutsDone,
    tolerance: 0,
    text: (s) => String(s.workoutsDone),
  },
  {
    id: 'steg',
    label: 'Snittsteg',
    feature: 'steg',
    value: (s) => s.steps,
    tolerance: 100,
    text: (s) => (s.steps == null ? null : formatInt(Math.round(s.steps))),
  },
];

/**
 * Rubrik för veckan: saklig och uppmuntrande, aldrig skuldbeläggande. Riktningen
 * bedöms mot målet (ned- eller uppgång). Uppgång mot målet beskrivs neutralt.
 */
export function weekHeadline(
  summary: WeekSummary,
  profile: { startWeightKg: number; goalWeightKg: number } | null,
): string {
  const change = summary.trendChangeKg;
  if (change == null) {
    return 'Ingen vägning den här veckan, så trenden syns nästa gång du väger dig.';
  }
  if (Math.abs(change) < 0.05) return 'Trenden höll sig stabil. Stabilitet är också ett resultat.';
  const direction = profile ? Math.sign(profile.goalWeightKg - profile.startWeightKg) || -1 : -1;
  const amount = formatKg(Math.abs(change));
  if (Math.sign(change) === direction) {
    return `Trenden rörde sig ${amount} mot målet. Fint jobbat!`;
  }
  return 'Trenden planade ut, det händer. En vecka säger lite – det är riktningen över tid som räknas.';
}

/** Kort rad om hur mycket som loggades. */
export function weekLoggedText(summary: WeekSummary): string {
  const days = summary.loggedDays;
  if (days === 7) return 'Du loggade något alla 7 dagarna – starkt!';
  return `Du loggade något ${String(days)} av 7 dagar.`;
}

/** "Vecka 38" */
export function weekName(summary: WeekSummary): string {
  return `Vecka ${String(isoWeekNumber(summary.from))}`;
}

/** "15 sep.–21 sep." */
export function weekRange(summary: WeekSummary): string {
  return `${formatShortDate(summary.from)}–${formatShortDate(summary.to)}`;
}

/** "Vecka 38 · 15 sep.–21 sep." */
export function weekTitle(summary: WeekSummary): string {
  return `${weekName(summary)} · ${weekRange(summary)}`;
}
