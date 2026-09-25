/**
 * Adaptiv TDEE: skattar den verkliga energiförbrukningen ur matloggen och
 * trendviktens förändring, och viktar skattningen mot formelvärdet efter hur
 * mycket och hur bra data som finns.
 *
 *   observerad TDEE = snittintag − (viktförändring per dag × 7 700)
 *
 * Viktförändringen är lutningen i en minsta kvadrat-anpassning av dagsvikterna
 * i fönstret (trendvikten), vilket är robust mot vätskesvängningar dag för dag.
 * Dagens datum räknas inte – dagen är inte slut och matloggen är ofullständig.
 */
import { addDays, daysBetween, toDayNumber } from './dates.ts';
import { KCAL_PER_KG } from './energy.ts';
import type { DailyWeight } from './stats.ts';

/** Minst så här många dagar med både vikt och matlogg. */
export const MIN_ADAPTIVE_DAYS = 14;
/** Längsta fönster som används (dagar). */
export const ADAPTIVE_WINDOW_DAYS = 28;
/** Minsta andel loggade matdagar i fönstret. */
export const MIN_LOGGED_FRACTION = 0.8;
/** Loggdatan får aldrig väga mer än så här mot formeln. */
export const MAX_ADAPTIVE_WEIGHT = 0.9;
/** Osäkerhet (kcal, ±1 standardfel) där precisionen halverar vikten. */
const HALF_WEIGHT_UNCERTAINTY = 200;
/** Observerad TDEE utanför [0,6; 1,6] × formeln tyder på loggfel och kläms. */
const MIN_RATIO = 0.6;
const MAX_RATIO = 1.6;

export type Confidence = 'låg' | 'medel' | 'hög';

export interface DatedKcal {
  date: string;
  kcal: number;
}

export interface AdaptiveInput {
  daily: readonly DailyWeight[];
  intake: readonly DatedKcal[];
  today: string;
  formulaTdee: number;
}

interface WindowStats {
  from: string;
  to: string;
  windowDays: number;
  loggedDays: number;
  bothDays: number;
  loggedFraction: number;
}

export type AdaptiveTdee =
  | ({ kind: 'formula'; tdee: number } & WindowStats)
  | ({
      kind: 'adaptive';
      /** Viktad TDEE som kalorimålet bygger på. */
      tdee: number;
      /** Rå skattning ur loggdatan (efter rimlighetsklämning). */
      observedTdee: number;
      /** Loggdatans vikt, 0–`MAX_ADAPTIVE_WEIGHT`. Resten är formeln. */
      weight: number;
      confidence: Confidence;
      /** ±1 standardfel för den observerade skattningen (kcal). */
      uncertaintyKcal: number;
      averageIntakeKcal: number;
      weeklyChangeKg: number;
      /** Skattningen låg utanför rimliga gränser och klämdes. */
      clamped: boolean;
    } & WindowStats);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Regression {
  slope: number;
  /** Standardfel för lutningen. */
  slopeSe: number;
}

/** Minsta kvadrat-anpassning y = a + b·x med standardfel för b. */
export function regress(points: readonly { x: number; y: number }[]): Regression | null {
  const n = points.length;
  if (n < 3) return null;
  const xMean = points.reduce((s, p) => s + p.x, 0) / n;
  const yMean = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - xMean) ** 2;
    sxy += (p.x - xMean) * (p.y - yMean);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  let ssr = 0;
  for (const p of points) {
    const fitted = yMean + slope * (p.x - xMean);
    ssr += (p.y - fitted) ** 2;
  }
  return { slope, slopeSe: Math.sqrt(ssr / (n - 2) / sxx) };
}

export function confidenceFor(weight: number): Confidence {
  if (weight >= 0.6) return 'hög';
  if (weight >= 0.35) return 'medel';
  return 'låg';
}

export function adaptiveTdee({ daily, intake, today, formulaTdee }: AdaptiveInput): AdaptiveTdee {
  const to = addDays(today, -1);
  const logged = intake.filter((d) => d.kcal > 0 && d.date <= to);
  const firstLogged = logged.reduce<string | null>(
    (min, d) => (min === null || d.date < min ? d.date : min),
    null,
  );
  const earliest = addDays(to, -(ADAPTIVE_WINDOW_DAYS - 1));
  const from = firstLogged !== null && firstLogged > earliest ? firstLogged : earliest;
  const windowDays = Math.max(0, daysBetween(from, to) + 1);

  const intakeInWindow = logged.filter((d) => d.date >= from);
  const intakeDates = new Set(intakeInWindow.map((d) => d.date));
  const weightsInWindow = daily.filter((d) => d.date >= from && d.date <= to);
  const bothDays = weightsInWindow.filter((d) => intakeDates.has(d.date)).length;
  const loggedDays = intakeDates.size;
  const stats: WindowStats = {
    from,
    to,
    windowDays,
    loggedDays,
    bothDays,
    loggedFraction: windowDays > 0 ? loggedDays / windowDays : 0,
  };

  const formula = { kind: 'formula' as const, tdee: formulaTdee, ...stats };
  if (
    windowDays < MIN_ADAPTIVE_DAYS ||
    bothDays < MIN_ADAPTIVE_DAYS ||
    stats.loggedFraction < MIN_LOGGED_FRACTION
  ) {
    return formula;
  }

  const origin = toDayNumber(from);
  const fit = regress(
    weightsInWindow.map((d) => ({ x: toDayNumber(d.date) - origin, y: d.weightKg })),
  );
  if (!fit) return formula;

  const averageIntakeKcal = intakeInWindow.reduce((s, d) => s + d.kcal, 0) / intakeInWindow.length;
  const rawObserved = averageIntakeKcal - fit.slope * KCAL_PER_KG;
  const observedTdee = clamp(rawObserved, formulaTdee * MIN_RATIO, formulaTdee * MAX_RATIO);
  const clamped = observedTdee !== rawObserved;
  const uncertaintyKcal = fit.slopeSe * KCAL_PER_KG;

  const lengthFactor = Math.min(1, bothDays / ADAPTIVE_WINDOW_DAYS);
  const precisionFactor = 1 / (1 + (uncertaintyKcal / HALF_WEIGHT_UNCERTAINTY) ** 2);
  const weight =
    MAX_ADAPTIVE_WEIGHT *
    lengthFactor *
    stats.loggedFraction *
    precisionFactor *
    (clamped ? 0.5 : 1);

  return {
    kind: 'adaptive',
    tdee: weight * observedTdee + (1 - weight) * formulaTdee,
    observedTdee,
    weight,
    confidence: confidenceFor(weight),
    uncertaintyKcal,
    averageIntakeKcal,
    weeklyChangeKg: fit.slope * 7,
    clamped,
    ...stats,
  };
}
