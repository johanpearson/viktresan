/**
 * Platådetektering och jämförelseanalys. Rena funktioner – "idag" skickas in.
 *
 * Regeln (`detectPlateau`): utvärderas bara när takten är > 0 (inte i
 * viktstabiliseringsläget), minst 4 veckor efter start och med vägning minst 70 %
 * av dagarna de senaste 21 dagarna. Platå = snittvikten den sista veckan i fönstret skiljer sig
 * mindre än 0,2 kg från snittvikten den första veckan (snitt jämnar ut dag-till-dag-bruset).
 *
 * Analysen (`analyzePlateau`) jämför de senaste tre veckorna med de tre innan
 * (hela dagar, t.o.m. igår – dagens matlogg är inte klar) och lyfter fram de en till
 * två mest sannolika förklaringarna. Texterna är sakliga och aldrig skuldbeläggande.
 */
import type { Injection, Medication } from '../db/db.ts';
import { addDays, daysBetween } from './dates.ts';
import { DEFAULT_RATE_KG } from './energy.ts';
import type { FeatureGated } from './features.ts';
import { formatInt, formatKcal, formatKg, formatMg, formatShortDate } from './format.ts';
import { describeDose, doseChanges, doseOn, isActive, medicationStart } from './glp1.ts';
import { dailyIntake, type DatedPortion } from './nutrition.ts';
import { buildPlan, type PlanProfile } from './plan.ts';
import {
  dailySteps,
  dailyWeights,
  weightChange,
  type DatedSteps,
  type DatedWeight,
} from './stats.ts';

/** Fönstret som platån bedöms över (dagar, t.o.m. idag). */
export const PLATEAU_WINDOW_DAYS = 21;
/** Snittvikten ska ha ändrats mindre än så här för att det ska räknas som platå. */
export const PLATEAU_THRESHOLD_KG = 0.2;
/** Tidigast så här många dagar efter start. */
export const PLATEAU_MIN_DAYS_SINCE_START = 28;
/** Snittvikten jämförs mellan fönstrets första och sista så många dagar. */
export const PLATEAU_AVERAGE_DAYS = 7;
/** Minsta andel dagar med vägning i fönstret. */
export const PLATEAU_MIN_WEIGH_FRACTION = 0.7;
/** Ett stängt platåkort visas igen tidigast efter så här många dagar. */
export const PLATEAU_SNOOZE_DAYS = 14;

export interface PlateauProfile extends PlanProfile {
  startDate: string;
}

export interface PlateauInput {
  profile: PlateauProfile | null;
  weights: readonly DatedWeight[];
  today: string;
}

export interface PlateauResult {
  kind: 'no-plateau' | 'plateau';
  /** Snittvikt fönstrets sista vecka − snittvikt fönstrets första vecka. */
  changeKg: number;
  from: string;
  to: string;
  weighDays: number;
}

export type PlateauCheck =
  | {
      kind: 'not-evaluated';
      reason: 'no-profile' | 'maintenance' | 'too-early' | 'too-few-weighins';
    }
  | PlateauResult;

/** Snittvikten för dagsvikterna `from`–`to`, eller `null` utan vägning. */
function averageBetween(
  daily: readonly { date: string; weightKg: number }[],
  from: string,
  to: string,
): number | null {
  const values = daily.filter((d) => d.date >= from && d.date <= to).map((d) => d.weightKg);
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

export function detectPlateau({ profile, weights, today }: PlateauInput): PlateauCheck {
  if (!profile) return { kind: 'not-evaluated', reason: 'no-profile' };
  if ((profile.ratePerWeekKg ?? DEFAULT_RATE_KG) <= 0) {
    return { kind: 'not-evaluated', reason: 'maintenance' };
  }
  if (daysBetween(profile.startDate, today) < PLATEAU_MIN_DAYS_SINCE_START) {
    return { kind: 'not-evaluated', reason: 'too-early' };
  }
  const from = addDays(today, -(PLATEAU_WINDOW_DAYS - 1));
  const daily = dailyWeights(weights.filter((w) => w.date <= today));
  const weighDays = daily.filter((d) => d.date >= from).length;
  if (weighDays / PLATEAU_WINDOW_DAYS < PLATEAU_MIN_WEIGH_FRACTION) {
    return { kind: 'not-evaluated', reason: 'too-few-weighins' };
  }
  const start = averageBetween(daily, from, addDays(from, PLATEAU_AVERAGE_DAYS - 1));
  const end = averageBetween(daily, addDays(today, -(PLATEAU_AVERAGE_DAYS - 1)), today);
  if (start == null || end == null) return { kind: 'not-evaluated', reason: 'too-few-weighins' };
  const changeKg = end - start;
  return {
    kind: Math.abs(changeKg) < PLATEAU_THRESHOLD_KG ? 'plateau' : 'no-plateau',
    changeKg,
    from,
    to: today,
    weighDays,
  };
}

/** Visa kortet: platå och inte stängt de senaste 14 dagarna. */
export function shouldShowPlateau(
  check: PlateauCheck,
  dismissedOn: string | null,
  today: string,
): boolean {
  if (check.kind !== 'plateau') return false;
  return dismissedOn === null || daysBetween(dismissedOn, today) >= PLATEAU_SNOOZE_DAYS;
}

// ---------------------------------------------------------------------------
// Jämförelse: senaste 3 veckorna mot de 3 innan

export interface PeriodStats {
  from: string;
  to: string;
  days: number;
  /** Vikt vid periodens slut − senaste vägningen före perioden. */
  weightChangeKg: number | null;
  /** Snitt per loggad matdag. */
  kcal: number | null;
  foodDays: number;
  /** Andel av periodens dagar med matlogg, 0–1. */
  foodShare: number;
  /** Snitt per dag med steg. */
  steps: number | null;
  stepsDays: number;
  /** Genomförda pass per vecka. */
  workoutsPerWeek: number;
  /** Beräknad förbrukning dagen efter perioden (adaptiv eller formel). */
  tdee: number | null;
  tdeeSource: 'adaptiv' | 'formel' | null;
  /** GLP-1-doser som gällde vid periodens slut, t.ex. "Wegovy 1 mg". */
  doses: string[];
}

export interface PlateauAnalysisInput {
  profile: PlateauProfile | null;
  weights: readonly DatedWeight[];
  foodLog: readonly DatedPortion[];
  steps: readonly DatedSteps[];
  workouts: readonly { date: string; status: string }[];
  medications: readonly Medication[];
  injections: readonly Injection[];
}

export type ExplanationId =
  | 'intag-upp'
  | 'nara-forbrukning'
  | 'farre-loggade'
  | 'forbrukning-ner'
  | 'farre-steg'
  | 'farre-pass'
  | 'dosandring';

export interface Explanation extends FeatureGated {
  id: ExplanationId;
  text: string;
  /** Ungefär hur mycket det kan betyda per dag (kcal) – används för att rangordna. */
  score: number;
}

export interface DoseChangeNote {
  date: string;
  text: string;
  /** Lägre dos eller uppehåll – kan påverka aptiten. */
  lower: boolean;
}

export interface PlateauAnalysis {
  recent: PeriodStats;
  previous: PeriodStats;
  /** Dosbyten från början av den tidigare perioden till idag. */
  doseChanges: DoseChangeNote[];
  /** Alla kandidater, mest sannolik först. Filtrera på funktion och ta de två första. */
  explanations: Explanation[];
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

function between<T extends { date: string }>(items: readonly T[], from: string, to: string): T[] {
  return items.filter((i) => i.date >= from && i.date <= to);
}

function activeDoses(
  medications: readonly Medication[],
  injections: readonly Injection[],
  date: string,
): string[] {
  return medications
    .filter((m) => {
      const start = medicationStart(m);
      return start !== null && start <= date && isActive(m, date);
    })
    .map((m) => {
      const last = injections
        .filter((i) => i.medicationId === m.id && i.date <= date)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
        .at(-1);
      return describeDose({ medicationName: m.name, doseMg: last?.doseMg ?? doseOn(m, date) });
    });
}

export function periodStats(input: PlateauAnalysisInput, from: string, to: string): PeriodStats {
  const days = daysBetween(from, to) + 1;
  const daily = dailyWeights(input.weights.filter((w) => w.date <= to));
  const intake = between(dailyIntake(input.foodLog), from, to).filter((d) => d.kcal > 0);
  const steps = between(dailySteps(input.steps), from, to);
  const done = between(input.workouts, from, to).filter((w) => w.status === 'genomford');
  let tdee: number | null = null;
  let tdeeSource: PeriodStats['tdeeSource'] = null;
  if (input.profile) {
    const plan = buildPlan(input.profile, input.weights, input.foodLog, addDays(to, 1));
    if (plan.kind === 'plan') {
      tdee = plan.adaptive.tdee;
      tdeeSource = plan.adaptive.kind === 'adaptive' ? 'adaptiv' : 'formel';
    }
  }
  return {
    from,
    to,
    days,
    weightChangeKg: weightChange(daily, from, to),
    kcal: mean(intake.map((d) => d.kcal)),
    foodDays: intake.length,
    foodShare: intake.length / days,
    steps: mean(steps.map((d) => d.steps)),
    stepsDays: steps.length,
    workoutsPerWeek: (done.length * 7) / days,
    tdee,
    tdeeSource,
    doses: activeDoses(input.medications, input.injections, to),
  };
}

/** Minst så många loggade matdagar per period för att jämföra intaget. */
const MIN_FOOD_DAYS = 7;
const MIN_STEPS_DAYS = 7;

export function analyzePlateau(input: PlateauAnalysisInput, today: string): PlateauAnalysis {
  const recentTo = addDays(today, -1);
  const recentFrom = addDays(recentTo, -(PLATEAU_WINDOW_DAYS - 1));
  const previousTo = addDays(recentFrom, -1);
  const previousFrom = addDays(previousTo, -(PLATEAU_WINDOW_DAYS - 1));
  const recent = periodStats(input, recentFrom, recentTo);
  const previous = periodStats(input, previousFrom, previousTo);

  const changes: DoseChangeNote[] = [];
  const all = doseChanges(input.injections);
  all.forEach((c, i) => {
    if (c.kind !== 'byte' || c.date < previousFrom || c.date > today) return;
    const before = all[i - 1];
    const lower =
      before !== undefined &&
      before.medicationName === c.medicationName &&
      c.doseMg < before.doseMg;
    changes.push({
      date: c.date,
      text: `${formatShortDate(c.date)}: ${
        before ? `${describeDose(before)} → ` : ''
      }${c.medicationName} ${formatMg(c.doseMg)}`,
      lower,
    });
  });

  const explanations: Explanation[] = [];
  const foodComparable = recent.foodDays >= MIN_FOOD_DAYS && previous.foodDays >= MIN_FOOD_DAYS;

  if (foodComparable && recent.kcal !== null && previous.kcal !== null) {
    const diff = recent.kcal - previous.kcal;
    if (diff >= 100) {
      explanations.push({
        id: 'intag-upp',
        feature: 'mat',
        score: diff,
        text: `Snittintaget har varit ungefär ${formatKcal(diff)} högre per loggad dag än de tre veckorna innan (${formatKcal(recent.kcal)} mot ${formatKcal(previous.kcal)}).`,
      });
    }
  }
  if (recent.foodDays >= MIN_FOOD_DAYS && recent.kcal !== null && recent.tdee !== null) {
    const margin = recent.tdee - recent.kcal;
    if (margin < 250) {
      explanations.push({
        id: 'nara-forbrukning',
        feature: 'mat',
        score: 250 - margin,
        text: `Snittintaget (${formatKcal(recent.kcal)}) ligger nära den beräknade förbrukningen (${formatKcal(recent.tdee)}), så underskottet är litet just nu.`,
      });
    }
  }
  const shareDrop = previous.foodShare - recent.foodShare;
  if (shareDrop >= 0.2 || (recent.foodShare < 0.6 && previous.foodDays > 0)) {
    explanations.push({
      id: 'farre-loggade',
      feature: 'mat',
      // Ologgade dagar gör intaget osäkert – ungefär lika tungt som en måttlig ökning.
      score: Math.max(shareDrop, 0.6 - recent.foodShare) * 500,
      text: `Maten är loggad ${String(recent.foodDays)} av ${String(recent.days)} dagar (${String(previous.foodDays)} av ${String(previous.days)} innan). Med färre loggade dagar blir snittintaget osäkrare.`,
    });
  }
  if (recent.tdee !== null && previous.tdee !== null) {
    const drop = previous.tdee - recent.tdee;
    if (drop >= 75) {
      explanations.push({
        id: 'forbrukning-ner',
        score: drop,
        text: `Den beräknade förbrukningen har sjunkit från ${formatKcal(previous.tdee)} till ${formatKcal(recent.tdee)} per dag. En lättare kropp gör av med mindre energi, så samma intag ger ett mindre underskott.`,
      });
    }
  }
  if (
    recent.steps !== null &&
    previous.steps !== null &&
    recent.stepsDays >= MIN_STEPS_DAYS &&
    previous.stepsDays >= MIN_STEPS_DAYS
  ) {
    const drop = previous.steps - recent.steps;
    if (drop >= 1000 && drop / previous.steps >= 0.15) {
      explanations.push({
        id: 'farre-steg',
        feature: 'steg',
        // Ungefär 0,04 kcal per steg.
        score: drop * 0.04,
        text: `Stegen har minskat från cirka ${formatInt(Math.round(previous.steps / 100) * 100)} till ${formatInt(Math.round(recent.steps / 100) * 100)} per dag, vilket sänker förbrukningen något.`,
      });
    }
  }
  const passDrop = previous.workoutsPerWeek - recent.workoutsPerWeek;
  if (passDrop >= 1) {
    explanations.push({
      id: 'farre-pass',
      feature: 'traning',
      // Ett pass ≈ 250 kcal, fördelat på veckans dagar.
      score: (passDrop * 250) / 7,
      text: `Det har blivit färre genomförda pass: ${formatPerWeek(recent.workoutsPerWeek)} mot ${formatPerWeek(previous.workoutsPerWeek)} per vecka.`,
    });
  }
  const lowered = changes.filter((c) => c.lower);
  if (lowered.length > 0) {
    explanations.push({
      id: 'dosandring',
      feature: 'glp1',
      score: 150,
      text: `GLP-1-dosen sänktes (${lowered.map((c) => c.text).join('; ')}), vilket kan påverka aptiten.`,
    });
  }
  explanations.sort((a, b) => b.score - a.score);
  return { recent, previous, doseChanges: changes, explanations };
}

/** 1.333 → "1,3" */
export function formatPerWeek(value: number): string {
  return (Math.round(value * 10) / 10).toLocaleString('sv-SE');
}

/** Alltid med i kortet: vätska och mätbrus kan dölja en nedgång. */
export const PLATEAU_NOISE_NOTE =
  'Vätska, salt, mage och mätbrus kan dölja en verklig nedgång i några veckor – en platå på tre veckor behöver inte betyda att något har slutat fungera.';

/** Rubriktext för kortet. */
export function plateauHeadline(check: PlateauResult): string {
  return `Snittvikten har ändrats ${formatKg(Math.abs(check.changeKg))} på ${String(PLATEAU_WINDOW_DAYS / 7)} veckor.`;
}

export interface ComparisonRow extends FeatureGated {
  id: 'vikt' | 'kcal' | 'mat' | 'steg' | 'pass' | 'tdee' | 'dos';
  label: string;
  recent: string;
  previous: string;
}

function or(value: string | null): string {
  return value ?? '–';
}

/** Raderna i jämförelsen, i visningsordning. Filtreras med funktionsbrytarna. */
export function comparisonRows(analysis: PlateauAnalysis): ComparisonRow[] {
  const { recent, previous } = analysis;
  const kcal = (p: PeriodStats) => (p.kcal === null ? null : formatKcal(p.kcal));
  const steps = (p: PeriodStats) =>
    p.steps === null ? null : formatInt(Math.round(p.steps / 100) * 100);
  const tdee = (p: PeriodStats) =>
    p.tdee === null ? null : `${formatKcal(p.tdee)}${p.tdeeSource === 'formel' ? ' (formel)' : ''}`;
  const weight = (p: PeriodStats) =>
    p.weightChangeKg === null ? null : formatKg(p.weightChangeKg, { signed: true });
  const rows: ComparisonRow[] = [
    { id: 'vikt', label: 'Vikt', recent: or(weight(recent)), previous: or(weight(previous)) },
    {
      id: 'kcal',
      label: 'Snittintag',
      feature: 'mat',
      recent: or(kcal(recent)),
      previous: or(kcal(previous)),
    },
    {
      id: 'mat',
      label: 'Loggade matdagar',
      feature: 'mat',
      recent: `${String(recent.foodDays)} av ${String(recent.days)}`,
      previous: `${String(previous.foodDays)} av ${String(previous.days)}`,
    },
    {
      id: 'steg',
      label: 'Snittsteg',
      feature: 'steg',
      recent: or(steps(recent)),
      previous: or(steps(previous)),
    },
    {
      id: 'pass',
      label: 'Pass per vecka',
      feature: 'traning',
      recent: formatPerWeek(recent.workoutsPerWeek),
      previous: formatPerWeek(previous.workoutsPerWeek),
    },
    { id: 'tdee', label: 'Förbrukning', recent: or(tdee(recent)), previous: or(tdee(previous)) },
  ];
  if (recent.doses.length > 0 || previous.doses.length > 0) {
    rows.push({
      id: 'dos',
      label: 'GLP-1-dos',
      feature: 'glp1',
      recent: or(recent.doses.join(', ') || null),
      previous: or(previous.doses.join(', ') || null),
    });
  }
  return rows;
}

/** Underlaget till "Fråga AI om platån": en rad per uppgift, bara påslagna funktioner. */
export function plateauPromptLines(
  check: PlateauResult,
  analysis: PlateauAnalysis,
  rows: readonly ComparisonRow[],
  explanations: readonly Explanation[],
): string[] {
  const { recent, previous } = analysis;
  return [
    `Snittvikten har ändrats ${formatKg(check.changeKg, { signed: true })} på ${String(PLATEAU_WINDOW_DAYS / 7)} veckor (första mot sista veckan, vägd ${String(check.weighDays)} av ${String(PLATEAU_WINDOW_DAYS)} dagar).`,
    `Jämförelse – senaste 3 veckorna (${formatShortDate(recent.from)}–${formatShortDate(recent.to)}) mot de 3 innan (${formatShortDate(previous.from)}–${formatShortDate(previous.to)}):`,
    ...rows.map((r) => `- ${r.label}: ${r.recent} (innan ${r.previous})`),
    ...analysis.doseChanges.map((c) => `- Dosbyte ${c.text}`),
    ...(explanations.length > 0
      ? ['Möjliga förklaringar enligt appen:', ...explanations.map((e) => `- ${e.text}`)]
      : ['Appen hittar inga tydliga skillnader mellan perioderna.']),
  ];
}
