/** Vatten: dagsmål och summor per dag. Rena funktioner utan I/O. */
import { dailyWeights, emaTrend, type DatedWeight } from './stats.ts';

/** Standardmål: 33 ml per kg trendvikt. */
export const WATER_ML_PER_KG = 33;
/** Snabbknappar i ml. */
export const WATER_QUICK_ADD: readonly number[] = [250, 500];
/** Gränser för ett eget mål och för en enskild post. */
export const WATER_GOAL_MIN_ML = 500;
export const WATER_GOAL_MAX_ML = 6000;
export const WATER_ENTRY_MAX_ML = 3000;

/** 33 ml × vikten, avrundat till närmaste 100 ml. */
export function defaultWaterGoalMl(weightKg: number): number {
  return Math.round((weightKg * WATER_ML_PER_KG) / 100) * 100;
}

export type WaterGoalSource = 'egen' | 'trend' | 'startvikt';

export interface WaterGoal {
  ml: number;
  source: WaterGoalSource;
  /** Vikten målet räknades från (inte för eget mål). */
  basisKg?: number;
}

export interface WaterGoalInput {
  weights: readonly DatedWeight[];
  profile: { startWeightKg: number; waterGoalMl?: number } | null;
}

/**
 * Dagens vattenmål: eget mål i profilen om det finns, annars 33 ml × trendvikten
 * (EMA över dagsvikterna). Utan mätningar används startvikten; utan profil → null.
 */
export function waterGoal({ weights, profile }: WaterGoalInput): WaterGoal | null {
  if (profile?.waterGoalMl != null) return { ml: profile.waterGoalMl, source: 'egen' };
  const trendKg = emaTrend(dailyWeights(weights)).at(-1)?.trendKg;
  if (trendKg != null)
    return { ml: defaultWaterGoalMl(trendKg), source: 'trend', basisKg: trendKg };
  if (profile) {
    return {
      ml: defaultWaterGoalMl(profile.startWeightKg),
      source: 'startvikt',
      basisKg: profile.startWeightKg,
    };
  }
  return null;
}

export interface DatedWater {
  date: string;
  ml: number;
}

export interface DailyWater {
  date: string;
  ml: number;
  count: number;
}

/** Summa per dag, äldst först. */
export function dailyWater(entries: readonly DatedWater[]): DailyWater[] {
  const byDate = new Map<string, DailyWater>();
  for (const e of entries) {
    const day = byDate.get(e.date);
    if (day) {
      day.ml += e.ml;
      day.count += 1;
    } else {
      byDate.set(e.date, { date: e.date, ml: e.ml, count: 1 });
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function waterOn(entries: readonly DatedWater[], date: string): number {
  return entries.reduce((sum, e) => (e.date === date ? sum + e.ml : sum), 0);
}
