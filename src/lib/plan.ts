/**
 * Sätter ihop profil, vikter och matlogg till dagens kalorimål: senaste vikten,
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
import { dailyWeights, type DatedWeight } from './stats.ts';

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
  | { kind: 'plan'; plan: CaloriePlan; adaptive: AdaptiveTdee; weightKg: number };

export function buildPlan(
  profile: PlanProfile,
  weights: readonly DatedWeight[],
  foodLog: readonly (DatedPortion & { usual?: true })[],
  today: string,
): PlanResult {
  const energy = energyProfileFrom(profile);
  if (!energy) return { kind: 'incomplete-profile' };
  const daily = dailyWeights(weights.filter((w) => w.date <= today));
  const weightKg = daily[daily.length - 1]?.weightKg ?? profile.startWeightKg;
  const formulaTdee =
    bmrMifflinStJeor(
      energy.sex,
      weightKg,
      energy.heightCm,
      ageFromBirthYear(energy.birthYear, today),
    ) * activityFactor(energy.activityLevel);
  // "Som vanligt"-dagar är gissningar: förbrukningen ska bara lära sig av riktiga loggar. Hela
  // dagen tas bort – annars blev en uppskattad dag + ett tillagt mellanmål en loggad dag med för
  // lite mat.
  const usualDates = new Set(foodLog.filter((e) => e.usual).map((e) => e.date));
  const intake = dailyIntake(foodLog.filter((e) => !usualDates.has(e.date)));
  const adaptive = adaptiveTdee({ daily, intake, today, formulaTdee });
  const plan = caloriePlan({
    profile: energy,
    weightKg,
    today,
    tdeeOverride: adaptive.kind === 'adaptive' ? adaptive.tdee : null,
  });
  return { kind: 'plan', plan, adaptive, weightKg };
}
