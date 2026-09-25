/**
 * Sätter ihop profil, vikter och matlogg till dagens kalorimål: trendvikt,
 * formel-TDEE, adaptiv TDEE och spärrar. Ren funktion.
 */
import { adaptiveTdee, type AdaptiveTdee } from './adaptiveTdee.ts';
import {
  activityFactor,
  ageFromBirthYear,
  bmrMifflinStJeor,
  caloriePlan,
  energyProfileFrom,
  type CaloriePlan,
} from './energy.ts';
import { dailyIntake, type DatedPortion } from './nutrition.ts';
import { dailyWeights, emaTrend, type DatedWeight } from './stats.ts';

export interface PlanProfile {
  startWeightKg: number;
  heightCm: number;
  goalWeightKg: number;
  goalDate?: string | undefined;
  sex?: 'man' | 'kvinna' | undefined;
  birthYear?: number | undefined;
  activityLevel?: 'stillasittande' | 'latt' | 'mattlig' | 'aktiv' | undefined;
  ratePerWeekKg?: number | undefined;
}

export type PlanResult =
  | { kind: 'incomplete-profile' }
  | { kind: 'plan'; plan: CaloriePlan; adaptive: AdaptiveTdee; trendKg: number };

export function buildPlan(
  profile: PlanProfile,
  weights: readonly DatedWeight[],
  foodLog: readonly DatedPortion[],
  today: string,
): PlanResult {
  const energy = energyProfileFrom(profile);
  if (!energy) return { kind: 'incomplete-profile' };
  const daily = dailyWeights(weights.filter((w) => w.date <= today));
  const trend = emaTrend(daily);
  const trendKg = trend[trend.length - 1]?.trendKg ?? profile.startWeightKg;
  const formulaTdee =
    bmrMifflinStJeor(
      energy.sex,
      trendKg,
      energy.heightCm,
      ageFromBirthYear(energy.birthYear, today),
    ) * activityFactor(energy.activityLevel);
  const adaptive = adaptiveTdee({ daily, intake: dailyIntake(foodLog), today, formulaTdee });
  const plan = caloriePlan({
    profile: energy,
    trendKg,
    today,
    tdeeOverride: adaptive.kind === 'adaptive' ? adaptive.tdee : null,
  });
  return { kind: 'plan', plan, adaptive, trendKg };
}
