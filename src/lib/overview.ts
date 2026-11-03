import type { Profile } from '../db/db.ts';
import { addDays } from './dates.ts';
import {
  bmi,
  forecastGoal,
  goalProgress,
  type DailyWeight,
  type GoalForecast,
  type GoalProgress,
  type InsufficientReason,
} from './stats.ts';

/** Standardtakten när profilen saknar vald takt (samma som i profilen). */
const DEFAULT_RATE_KG = 0.5;

export interface OverviewStats {
  /** Senaste dagsvikten (startvikten utan vägning) – alla härledda värden räknas på den. */
  weightKg: number;
  /** Senaste vägningsdagen. */
  latestDate: string | null;
  /** Förändring mot startvikten, kvar till mål och andel av vägen. */
  progress: GoalProgress;
  bmi: number | null;
  forecast: GoalForecast;
}

/**
 * Översikts nyckeltal. Förändring (mot startvikten), kvar till mål, framsteg i %, BMI och
 * prognosens utgångsvikt räknas alla på senaste dagsvikten.
 */
export function overviewStats({
  profile,
  daily,
  today,
}: {
  profile: Pick<
    Profile,
    'startWeightKg' | 'goalWeightKg' | 'heightCm' | 'goalDate' | 'startDate' | 'ratePerWeekKg'
  >;
  daily: readonly DailyWeight[];
  today: string;
}): OverviewStats {
  const latest = daily[daily.length - 1];
  const weightKg = latest?.weightKg ?? profile.startWeightKg;
  return {
    weightKg,
    latestDate: latest?.date ?? null,
    progress: goalProgress(profile.startWeightKg, weightKg, profile.goalWeightKg),
    bmi: bmi(weightKg, profile.heightCm),
    forecast: forecastGoal({
      daily,
      goalKg: profile.goalWeightKg,
      today,
      goalDate: profile.goalDate,
      startDate: profile.startDate,
      rateKg: profile.ratePerWeekKg ?? DEFAULT_RATE_KG,
      fromKg: latest ? weightKg : undefined,
    }),
  };
}

/**
 * När målvikten nås – en enda uppgift på Översikt:
 * - `forecast`: prognos ur vägningarna (≥ 21 dagar sedan start, ≥ 12 vägningar och takten leder
 *   mot målet); `range` = intervall vid stor osäkerhet, `capped` = takten begränsad till en hållbar takt,
 * - `plan`: annars datumet enligt vald takt ("enligt plan"); `reason` säger varför vägningarna inte räcker,
 * - `reached`: målet är nått,
 * - `null`: inget datum går att räkna ut (takt 0, ingen takt att räkna på).
 */
export type GoalEta =
  | { kind: 'reached' }
  | {
      kind: 'forecast';
      date: string;
      range: { from: string; to: string } | null;
      weeklyChangeKg: number;
      capped: boolean;
    }
  | { kind: 'plan'; date: string; rateKg: number; reason: PlanReason };

/** Varför datumet är enligt plan: för tidigt/för få vägningar, osäker takt eller fel riktning. */
export type PlanReason = InsufficientReason | 'not-progressing';

/** Visas när prognosen har begränsats till en hållbar takt. */
export const CAPPED_NOTE =
  'Takten är just nu snabbare än planerat, prognosen utgår från en hållbar takt.';

export function goalEta({
  stats,
  today,
  rateKg,
  planDate,
}: {
  stats: Pick<OverviewStats, 'progress' | 'forecast'>;
  today: string;
  /** Vald takt (kg/vecka); `undefined` = standardtakten. */
  rateKg: number | undefined;
  /** Kalorimålets datum med takten efter spärrar (`plan.forecastDate`), om det finns. */
  planDate?: string | null | undefined;
}): GoalEta | null {
  const { progress, forecast } = stats;
  if (progress.reached || forecast.kind === 'reached') return { kind: 'reached' };
  if (forecast.kind === 'forecast') {
    return {
      kind: 'forecast',
      date: forecast.date,
      range: forecast.range,
      weeklyChangeKg: forecast.weeklyChangeKg,
      capped: forecast.capped,
    };
  }
  const rate = rateKg ?? DEFAULT_RATE_KG;
  if (rate <= 0 || progress.remainingKg <= 0) return null;
  const date = planDate ?? addDays(today, Math.ceil((progress.remainingKg / rate) * 7));
  const reason: PlanReason =
    forecast.kind === 'insufficient-data' ? forecast.reason : 'not-progressing';
  return { kind: 'plan', date, rateKg: rate, reason };
}
