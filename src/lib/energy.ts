/**
 * Energibehov och kalorimål. Rena funktioner – allt som behövs skickas in,
 * inklusive "idag".
 *
 * - BMR enligt Mifflin-St Jeor, TDEE = BMR × aktivitetsfaktor.
 * - Dagligt kalorimål = TDEE − (takt × 7 700 / 7).
 * - Spärrar: takt högst 1 kg/vecka och högst 1 % av trendvikten per vecka,
 *   kalorimål aldrig under 1 500 kcal (man) / 1 200 kcal (kvinna).
 * - Måldatum höjer aldrig underskottet – det kontrolleras bara mot vad som är rimligt.
 */
import { addDays, daysBetween } from './dates.ts';

export type Sex = 'man' | 'kvinna';
export type ActivityLevel = 'stillasittande' | 'latt' | 'mattlig' | 'aktiv';

export const ACTIVITY_LEVELS: readonly {
  id: ActivityLevel;
  label: string;
  description: string;
  factor: number;
}[] = [
  {
    id: 'stillasittande',
    label: 'Stillasittande',
    description: 'Kontorsjobb, lite promenader, ingen träning.',
    factor: 1.2,
  },
  {
    id: 'latt',
    label: 'Lätt aktiv',
    description: 'Promenader dagligen eller träning 1–3 gånger i veckan.',
    factor: 1.375,
  },
  {
    id: 'mattlig',
    label: 'Måttligt aktiv',
    description: 'Träning 3–5 gånger i veckan eller ett jobb där du rör dig mycket.',
    factor: 1.55,
  },
  {
    id: 'aktiv',
    label: 'Mycket aktiv',
    description: 'Hård träning 6–7 gånger i veckan eller fysiskt tungt arbete.',
    factor: 1.725,
  },
];

/** Tillåtna val för önskad takt (kg per vecka). 0 = håll vikten (viktstabilisering). */
export const RATE_OPTIONS: readonly number[] = [0, 0.25, 0.5, 0.75, 1.0];
export const DEFAULT_RATE_KG = 0.5;

/** Energiinnehåll i ett kilo kroppsvikt (kcal), tumregel. */
export const KCAL_PER_KG = 7700;
/** Högsta tillåtna takt oavsett vikt (kg/vecka). */
export const MAX_RATE_KG = 1;
/** Högsta tillåtna takt som andel av trendvikten per vecka. */
export const MAX_RATE_FRACTION = 0.01;

export const CALORIE_FLOOR: Record<Sex, number> = { man: 1500, kvinna: 1200 };

export function activityFactor(level: ActivityLevel): number {
  return ACTIVITY_LEVELS.find((a) => a.id === level)?.factor ?? 1.2;
}

/** Ålder i hela år, räknat på kalenderår (födelsedag okänd). */
export function ageFromBirthYear(birthYear: number, today: string): number {
  return Number(today.slice(0, 4)) - birthYear;
}

/** Basalomsättning (kcal/dag) enligt Mifflin-St Jeor. */
export function bmrMifflinStJeor(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  ageYears: number,
): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'man' ? 5 : -161);
}

/** Högsta tillåtna takt (kg/vecka) vid en viss trendvikt. */
export function maxRateKg(trendKg: number): number {
  return Math.min(MAX_RATE_KG, MAX_RATE_FRACTION * trendKg);
}

/** Dagligt underskott (kcal) för en takt i kg/vecka. */
export function deficitForRate(rateKgPerWeek: number): number {
  return (rateKgPerWeek * KCAL_PER_KG) / 7;
}

/** Takt (kg/vecka) som ett dagligt underskott motsvarar. */
export function rateForDeficit(deficitKcal: number): number {
  return (deficitKcal * 7) / KCAL_PER_KG;
}

export interface EnergyProfile {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  ratePerWeekKg: number;
  goalWeightKg: number;
  goalDate?: string | undefined;
}

/** Spärrar som påverkat kalorimålet. */
export type PlanLimit =
  /** Vald takt överstiger 1 kg/vecka eller 1 % av trendvikten – takten sänktes. */
  | 'rate-capped'
  /** Kalorimålet skulle hamna under golvet – det höjdes och takten sänktes. */
  | 'calorie-floor'
  /** Trendvikten ligger på eller under målvikten – målet är underhåll. */
  | 'goal-reached'
  /** Vald takt är 0 (viktstabilisering) – kalorimålet är förbrukningen. */
  | 'maintenance';

export type GoalDateCheck =
  | { kind: 'none' }
  | { kind: 'passed' }
  /** Måldatumet nås med vald takt. */
  | { kind: 'ok'; requiredRateKg: number }
  /** Måldatumet kräver snabbare takt än vald, men inom spärrarna. */
  | { kind: 'needs-faster'; requiredRateKg: number }
  /** Måldatumet kräver snabbare takt än tillåtet. */
  | {
      kind: 'unrealistic';
      requiredRateKg: number;
      /** Snabbaste takt som klarar alla spärrar. */
      maxRateKg: number;
      earliestDate: string | null;
    };

export interface CaloriePlanInput {
  profile: EnergyProfile;
  /** Aktuell trendvikt (kg). */
  trendKg: number;
  today: string;
  /** Skattad TDEE från loggdata (redan viktad mot formeln), om sådan finns. */
  tdeeOverride?: number | null | undefined;
}

export interface CaloriePlan {
  ageYears: number;
  bmr: number;
  formulaTdee: number;
  /** Den TDEE som målet bygger på (formel eller adaptiv skattning). */
  tdee: number;
  chosenRateKg: number;
  maxRateKg: number;
  /** Takten målet faktiskt ger efter spärrar. */
  rateKg: number;
  deficitKcal: number;
  floorKcal: number;
  /** Dagligt kalorimål, avrundat till heltal. */
  targetKcal: number;
  limits: PlanLimit[];
  remainingKg: number;
  /** När målvikten nås med `rateKg`, `null` om takten är 0 eller målet nått. */
  forecastDate: string | null;
  goalDateCheck: GoalDateCheck;
}

const EPSILON = 1e-9;

function weeksToLose(remainingKg: number, rateKg: number): number {
  return remainingKg / rateKg;
}

function dateAfterWeeks(today: string, weeks: number): string {
  return addDays(today, Math.ceil(weeks * 7));
}

export function caloriePlan({
  profile,
  trendKg,
  today,
  tdeeOverride,
}: CaloriePlanInput): CaloriePlan {
  const ageYears = ageFromBirthYear(profile.birthYear, today);
  const bmr = bmrMifflinStJeor(profile.sex, trendKg, profile.heightCm, ageYears);
  const formulaTdee = bmr * activityFactor(profile.activityLevel);
  const tdee = tdeeOverride ?? formulaTdee;
  const floorKcal = CALORIE_FLOOR[profile.sex];
  const maxRate = maxRateKg(trendKg);
  const chosenRateKg = profile.ratePerWeekKg;
  const remainingKg = Math.max(0, trendKg - profile.goalWeightKg);
  const limits: PlanLimit[] = [];

  let rateKg: number;
  let deficitKcal: number;
  let target: number;

  if (chosenRateKg === 0 && Math.round(remainingKg * 10) !== 0) {
    // Viktstabilisering: ingen nedgång, målet är förbrukningen (men aldrig under golvet).
    limits.push('maintenance');
    rateKg = 0;
    deficitKcal = 0;
    target = Math.max(tdee, floorKcal);
  } else if (Math.round(remainingKg * 10) === 0) {
    // Målet är nått: underhåll (men aldrig under golvet).
    limits.push('goal-reached');
    rateKg = 0;
    deficitKcal = 0;
    target = Math.max(tdee, floorKcal);
  } else {
    rateKg = Math.min(chosenRateKg, maxRate);
    if (chosenRateKg > maxRate + EPSILON) limits.push('rate-capped');
    deficitKcal = deficitForRate(rateKg);
    target = tdee - deficitKcal;
    if (target < floorKcal) {
      limits.push('calorie-floor');
      target = floorKcal;
      deficitKcal = Math.max(0, tdee - floorKcal);
      rateKg = rateForDeficit(deficitKcal);
    }
  }

  const reached = limits.includes('goal-reached') || limits.includes('maintenance');
  const forecastDate =
    !reached && rateKg > EPSILON ? dateAfterWeeks(today, weeksToLose(remainingKg, rateKg)) : null;

  return {
    ageYears,
    bmr,
    formulaTdee,
    tdee,
    chosenRateKg,
    maxRateKg: maxRate,
    rateKg,
    deficitKcal,
    floorKcal,
    targetKcal: Math.round(target),
    limits,
    remainingKg: reached ? 0 : remainingKg,
    forecastDate,
    goalDateCheck: reached
      ? { kind: 'none' }
      : checkGoalDate({
          goalDate: profile.goalDate,
          today,
          remainingKg,
          rateKg,
          maxRateKg: Math.min(maxRate, rateForDeficit(Math.max(0, tdee - floorKcal))),
        }),
  };
}

/**
 * Jämför måldatumet med vald och högsta tillåtna takt. `maxRateKg` är den
 * snabbaste takten som klarar alla spärrar (inklusive kaloriegolvet).
 */
export function checkGoalDate({
  goalDate,
  today,
  remainingKg,
  rateKg,
  maxRateKg: maxRate,
}: {
  goalDate?: string | undefined;
  today: string;
  remainingKg: number;
  rateKg: number;
  maxRateKg: number;
}): GoalDateCheck {
  if (!goalDate) return { kind: 'none' };
  const days = daysBetween(today, goalDate);
  if (days <= 0) return { kind: 'passed' };
  const requiredRateKg = remainingKg / (days / 7);
  if (requiredRateKg > maxRate + EPSILON) {
    return {
      kind: 'unrealistic',
      requiredRateKg,
      maxRateKg: maxRate,
      earliestDate: maxRate > EPSILON ? dateAfterWeeks(today, remainingKg / maxRate) : null,
    };
  }
  if (requiredRateKg > rateKg + EPSILON) return { kind: 'needs-faster', requiredRateKg };
  return { kind: 'ok', requiredRateKg };
}

/** Har profilen allt som behövs för att räkna ut ett kalorimål? */
export function energyProfileFrom(profile: {
  sex?: Sex | undefined;
  birthYear?: number | undefined;
  heightCm: number;
  activityLevel?: ActivityLevel | undefined;
  ratePerWeekKg?: number | undefined;
  goalWeightKg: number;
  goalDate?: string | undefined;
}): EnergyProfile | null {
  const { sex, birthYear, activityLevel } = profile;
  if (sex === undefined || birthYear === undefined || activityLevel === undefined) return null;
  return {
    sex,
    birthYear,
    heightCm: profile.heightCm,
    activityLevel,
    ratePerWeekKg: profile.ratePerWeekKg ?? DEFAULT_RATE_KG,
    goalWeightKg: profile.goalWeightKg,
    goalDate: profile.goalDate,
  };
}
