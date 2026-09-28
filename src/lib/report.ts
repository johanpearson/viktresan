/**
 * Rapport till vården (Framsteg → Rapport): period, sektioner och aggregering av
 * datan per period. Rena funktioner – "idag" skickas in, inga nätverksanrop.
 */
import type { ExtraNutrients } from '../data/nutrients.ts';
import type {
  FoodLogEntry,
  Injection,
  Medication,
  PhotoSession,
  Profile,
  SavedMeal,
  StepsEntry,
  Supplement,
  SupplementIntake,
  SymptomEntry,
  WaistEntry,
  WeightEntry,
} from '../db/db.ts';
import { addDays, daysBetween, isIsoDate } from './dates.ts';
import type { FeatureGated } from './features.ts';
import { formatMg } from './format.ts';
import {
  describeSchedule,
  doseChanges,
  isCovered,
  scheduleDates,
  WEEKLY_WINDOW_DAYS,
} from './glp1.ts';
import { partsOf } from './mealAnalysis.ts';
import { dailyIntake } from './nutrition.ts';
import { proteinGoalFor } from './protein.ts';
import { bmi, bmiCategory, dailySteps, dailyWeights, emaTrend } from './stats.ts';
import { describeSupplement } from './supplements.ts';
import { mondayOf } from './weekSummary.ts';

// ---------------------------------------------------------------------------
// Inställningar (sparas i preferences.report)

export type ReportPeriod = '4v' | '12v' | 'start' | 'egen';

export const REPORT_PERIODS: readonly { id: ReportPeriod; label: string }[] = [
  { id: '4v', label: '4 veckor' },
  { id: '12v', label: '12 veckor' },
  { id: 'start', label: 'Sedan start' },
  { id: 'egen', label: 'Egen' },
];

export type ReportSectionId =
  'grunddata' | 'vikt' | 'midja' | 'glp1' | 'kost' | 'tillskott' | 'traning' | 'steg' | 'bilder';

export interface ReportSectionInfo extends FeatureGated {
  id: ReportSectionId;
  label: string;
  description: string;
}

/** Sektionerna i rapportens ordning. Filtreras med funktionsbrytarna. */
export const REPORT_SECTIONS: readonly ReportSectionInfo[] = [
  {
    id: 'grunddata',
    label: 'Grunddata',
    description: 'Längd, startvikt, trendvikt, förändring och BMI',
  },
  { id: 'vikt', label: 'Viktgraf', description: 'Dagsvikter och trendlinje' },
  { id: 'midja', label: 'Midjemått', description: 'Mätningar och förändring', feature: 'midja' },
  {
    id: 'glp1',
    label: 'GLP-1',
    description: 'Läkemedel, doser, missade doser, aptit och biverkningar',
    feature: 'glp1',
  },
  {
    id: 'kost',
    label: 'Kost i snitt',
    description: 'Kcal, protein, fiber och loggade dagar',
    feature: 'mat',
  },
  { id: 'tillskott', label: 'Tillskott', description: 'Tagna tillskott', feature: 'tillskott' },
  { id: 'traning', label: 'Träning', description: 'Genomförda pass per vecka', feature: 'traning' },
  { id: 'steg', label: 'Steg', description: 'Snitt per dag', feature: 'steg' },
  {
    id: 'bilder',
    label: 'Bilder',
    description: 'Första och senaste fototillfället',
    feature: 'bilder',
  },
];

export interface ReportSettings {
  period: ReportPeriod;
  /** Egen period (bara när `period` är `egen`). */
  customFrom: string | null;
  customTo: string | null;
  sections: Record<ReportSectionId, boolean>;
}

/** Allt är med utom bilder, som är känsliga och kräver ett aktivt val. */
export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  period: '12v',
  customFrom: null,
  customTo: null,
  sections: {
    grunddata: true,
    vikt: true,
    midja: true,
    glp1: true,
    kost: true,
    tillskott: true,
    traning: true,
    steg: true,
    bilder: false,
  },
};

function isPeriod(value: unknown): value is ReportPeriod {
  return REPORT_PERIODS.some((p) => p.id === value);
}

function isoOrNull(value: unknown): string | null {
  return typeof value === 'string' && isIsoDate(value) ? value : null;
}

export function parseReportSettings(raw: unknown): ReportSettings {
  const stored = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const sections = { ...DEFAULT_REPORT_SETTINGS.sections };
  const rawSections =
    typeof stored.sections === 'object' && stored.sections !== null
      ? (stored.sections as Record<string, unknown>)
      : {};
  for (const key of Object.keys(sections) as ReportSectionId[]) {
    const value = rawSections[key];
    if (typeof value === 'boolean') sections[key] = value;
  }
  return {
    period: isPeriod(stored.period) ? stored.period : DEFAULT_REPORT_SETTINGS.period,
    customFrom: isoOrNull(stored.customFrom),
    customTo: isoOrNull(stored.customTo),
    sections,
  };
}

export interface ReportRange {
  from: string;
  to: string;
}

/**
 * Perioden som datum (båda inklusive). "Sedan start" börjar vid profilens startdatum
 * eller första vägningen om den är tidigare. En egen period som saknar datum eller
 * slutar före start ger `null`; ett slut efter idag kortas till idag.
 */
export function reportRange(
  settings: Pick<ReportSettings, 'period' | 'customFrom' | 'customTo'>,
  input: { profile: Pick<Profile, 'startDate'> | null; weights: readonly { date: string }[] },
  today: string,
): ReportRange | null {
  switch (settings.period) {
    case '4v':
      return { from: addDays(today, -27), to: today };
    case '12v':
      return { from: addDays(today, -83), to: today };
    case 'start': {
      const first = input.weights.reduce<string | null>(
        (min, w) => (min === null || w.date < min ? w.date : min),
        null,
      );
      const start = input.profile?.startDate ?? null;
      const from = [start, first].filter((d) => d !== null).sort()[0] ?? today;
      return { from: from > today ? today : from, to: today };
    }
    case 'egen': {
      const { customFrom: from, customTo } = settings;
      if (from === null || customTo === null) return null;
      const to = customTo > today ? today : customTo;
      return from <= to ? { from, to } : null;
    }
  }
}

// ---------------------------------------------------------------------------
// Aggregering

export interface ReportInput {
  profile: Profile | null;
  weights: readonly WeightEntry[];
  waist: readonly WaistEntry[];
  steps: readonly StepsEntry[];
  foodLog: readonly FoodLogEntry[];
  workouts: readonly { date: string; status: string; durationMin: number }[];
  medications: readonly Medication[];
  injections: readonly Injection[];
  symptoms: readonly SymptomEntry[];
  supplements: readonly Supplement[];
  supplementLog: readonly SupplementIntake[];
}

/** Livsmedelsverkets fiberdata för kosten (valfritt – utan den blir fibern okänd). */
export interface FiberSource {
  meals: readonly SavedMeal[];
  lookup: (foodId: string) => ExtraNutrients | null | undefined;
}

export interface ReportBasics {
  heightCm: number;
  startDate: string;
  startWeightKg: number;
  goalWeightKg: number;
  /** Trendvikt vid periodens slut (startvikten om ingen vägning finns). */
  trendKg: number;
  /** Trendvikt − startvikt. */
  changeKg: number;
  /** Förändring i procent av startvikten. */
  changePct: number;
  /** Trendvikten under perioden: slut − början. `null` utan vägning i perioden. */
  periodChangeKg: number | null;
  bmi: number | null;
  bmiCategory: string | null;
}

export interface ReportWeight {
  points: { date: string; value: number }[];
  trend: { date: string; value: number }[];
  weighDays: number;
}

export interface ReportWaist {
  entries: { date: string; value: number }[];
  /** Senaste − första mätningen i perioden. */
  changeCm: number | null;
}

export interface ReportDoseRow {
  date: string;
  medicationName: string;
  doseMg: number;
  kind: 'start' | 'byte' | 'gällande';
}

export interface ReportGlp1 {
  medications: { name: string; schedule: string; ended: string | null }[];
  /** Dos vid periodens början (om behandlingen redan pågick) och alla byten i perioden. */
  timeline: ReportDoseRow[];
  injections: number;
  /** Schemalagda doser i perioden vars tidsfönster passerat. */
  scheduled: number;
  missed: { date: string; medicationName: string }[];
  appetite: { date: string; value: number }[];
  sideEffects: { name: string; days: number }[];
  symptomDays: number;
}

export interface ReportDiet {
  kcal: number | null;
  proteinG: number | null;
  proteinGoalG: number | null;
  /** Snitt per loggad dag, `null` utan fiberdata. */
  fiberG: number | null;
  /** Andel (0–1) av mängden där fiber är känt. */
  fiberCoverage: number;
  foodDays: number;
  /** Andel av periodens dagar med matlogg. */
  loggedShare: number;
  /** Poster som bara är uppskattade (snabblogg). */
  estimatedEntries: number;
}

export interface ReportSupplementRow {
  name: string;
  /** Dagar med minst en tagen dos. */
  days: number;
  /** Innehåll per dos, om tillskottet finns kvar. */
  description: string | null;
}

export interface ReportTraining {
  done: number;
  minutes: number;
  perWeek: number;
  /** Per kalendervecka (måndag), även veckor utan pass. */
  weeks: { from: string; count: number; minutes: number }[];
}

export interface ReportSteps {
  average: number | null;
  days: number;
  points: { date: string; value: number }[];
}

export interface Report extends ReportRange {
  days: number;
  basics: ReportBasics | null;
  weight: ReportWeight;
  waist: ReportWaist;
  glp1: ReportGlp1;
  diet: ReportDiet;
  supplements: ReportSupplementRow[];
  training: ReportTraining;
  steps: ReportSteps;
}

function between<T extends { date: string }>(items: readonly T[], from: string, to: string): T[] {
  return items.filter((i) => i.date >= from && i.date <= to);
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

function trendAt(trend: readonly { date: string; trendKg: number }[], date: string): number | null {
  let value: number | null = null;
  for (const point of trend) {
    if (point.date > date) break;
    value = point.trendKg;
  }
  return value;
}

function basicsOf(input: ReportInput, range: ReportRange): ReportBasics | null {
  const { profile } = input;
  if (!profile) return null;
  const trend = emaTrend(dailyWeights(input.weights.filter((w) => w.date <= range.to)));
  const trendKg = trendAt(trend, range.to) ?? profile.startWeightKg;
  const inPeriod = trend.filter((t) => t.date >= range.from && t.date <= range.to);
  const before = trendAt(trend, addDays(range.from, -1));
  const start = before ?? (inPeriod.length > 1 ? inPeriod[0]?.trendKg : undefined);
  const end = inPeriod.at(-1)?.trendKg;
  const bmiValue = bmi(trendKg, profile.heightCm);
  const changeKg = trendKg - profile.startWeightKg;
  return {
    heightCm: profile.heightCm,
    startDate: profile.startDate,
    startWeightKg: profile.startWeightKg,
    goalWeightKg: profile.goalWeightKg,
    trendKg,
    changeKg,
    changePct: profile.startWeightKg > 0 ? (changeKg / profile.startWeightKg) * 100 : 0,
    periodChangeKg: start != null && end != null ? end - start : null,
    bmi: bmiValue,
    bmiCategory: bmiValue === null ? null : bmiCategory(bmiValue),
  };
}

function weightOf(input: ReportInput, range: ReportRange): ReportWeight {
  const daily = dailyWeights(input.weights.filter((w) => w.date <= range.to));
  const trend = emaTrend(daily);
  const points = between(daily, range.from, range.to);
  return {
    points: points.map((d) => ({ date: d.date, value: d.weightKg })),
    trend: between(trend, range.from, range.to).map((t) => ({ date: t.date, value: t.trendKg })),
    weighDays: points.length,
  };
}

function waistOf(input: ReportInput, range: ReportRange): ReportWaist {
  const entries = between(input.waist, range.from, range.to)
    .map((w) => ({ date: w.date, value: w.waistCm }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = entries[0];
  const last = entries.at(-1);
  return {
    entries,
    changeCm: first && last && entries.length > 1 ? last.value - first.value : null,
  };
}

function glp1Of(input: ReportInput, range: ReportRange, today: string): ReportGlp1 {
  const meds = input.medications.filter((m) => {
    const start = m.steps[0]?.date;
    return (
      start !== undefined && start <= range.to && (m.endDate == null || m.endDate >= range.from)
    );
  });
  const changes = doseChanges(input.injections);
  const timeline: ReportDoseRow[] = [];
  const current = changes.filter((c) => c.date < range.from).at(-1);
  if (current) {
    timeline.push({
      date: range.from,
      medicationName: current.medicationName,
      doseMg: current.doseMg,
      kind: 'gällande',
    });
  }
  for (const c of between(changes, range.from, range.to)) {
    timeline.push({
      date: c.date,
      medicationName: c.medicationName,
      doseMg: c.doseMg,
      kind: c.kind,
    });
  }

  // En dos är missad först när dess fönster (±3 dagar för veckodoser) passerat.
  let scheduled = 0;
  const missed: ReportGlp1['missed'] = [];
  for (const med of meds) {
    const window = med.frequency === 'vecka' ? WEEKLY_WINDOW_DAYS : 0;
    const last = addDays(today, -(window + 1));
    const to = range.to < last ? range.to : last;
    for (const date of scheduleDates(med, range.from, to)) {
      scheduled += 1;
      if (!isCovered(med, date, input.injections)) missed.push({ date, medicationName: med.name });
    }
  }

  const symptoms = between(input.symptoms, range.from, range.to).sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );
  const effects = new Map<string, number>();
  for (const s of symptoms) {
    for (const e of new Set(s.sideEffects)) effects.set(e, (effects.get(e) ?? 0) + 1);
  }
  return {
    medications: meds.map((m) => ({
      name: m.name,
      schedule: describeSchedule(m),
      ended: m.endDate != null && m.endDate <= range.to ? m.endDate : null,
    })),
    timeline,
    injections: between(input.injections, range.from, range.to).length,
    scheduled,
    missed: missed.sort((a, b) => (a.date < b.date ? -1 : 1)),
    appetite: symptoms.flatMap((s) =>
      s.appetite === undefined ? [] : [{ date: s.date, value: s.appetite }],
    ),
    sideEffects: [...effects.entries()]
      .map(([name, days]) => ({ name, days }))
      .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'sv')),
    symptomDays: symptoms.length,
  };
}

function dietOf(
  input: ReportInput,
  range: ReportRange,
  days: number,
  fiber: FiberSource | null,
): ReportDiet {
  const entries = between(input.foodLog, range.from, range.to);
  const intake = dailyIntake(entries).filter((d) => d.kcal > 0);
  let fiberG: number | null = null;
  let coverage = 0;
  if (fiber && intake.length > 0) {
    let amount = 0;
    let known = 0;
    let total = 0;
    for (const entry of entries) {
      // Snabbloggar har bara uppskattade kcal och räknas inte in i fibern.
      if (entry.estimated) continue;
      for (const part of partsOf(entry, fiber.meals, fiber.lookup)) {
        total += part.grams;
        const value = part.extra?.fiberG;
        if (value === undefined) continue;
        amount += (value * part.grams) / 100;
        known += part.grams;
      }
    }
    if (known > 0) {
      fiberG = amount / intake.length;
      coverage = total > 0 ? known / total : 0;
    }
  }
  return {
    kcal: mean(intake.map((d) => d.kcal)),
    proteinG: mean(intake.map((d) => d.proteinG)),
    proteinGoalG: proteinGoalFor(input.profile),
    fiberG,
    fiberCoverage: coverage,
    foodDays: intake.length,
    loggedShare: days > 0 ? intake.length / days : 0,
    estimatedEntries: entries.filter((e) => e.estimated).length,
  };
}

function supplementsOf(input: ReportInput, range: ReportRange): ReportSupplementRow[] {
  const byId = new Map<string, { name: string; dates: Set<string> }>();
  for (const intake of between(input.supplementLog, range.from, range.to)) {
    if (intake.doses <= 0) continue;
    const row = byId.get(intake.supplementId) ?? { name: intake.name, dates: new Set<string>() };
    row.dates.add(intake.date);
    byId.set(intake.supplementId, row);
  }
  return [...byId.entries()]
    .map(([id, row]) => {
      const current = input.supplements.find((s) => s.id === id);
      return {
        name: current?.name ?? row.name,
        days: row.dates.size,
        description: current ? describeSupplement(current) : null,
      };
    })
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'sv'));
}

function trainingOf(input: ReportInput, range: ReportRange, days: number): ReportTraining {
  const done = between(input.workouts, range.from, range.to).filter(
    (w) => w.status === 'genomford',
  );
  const weeks: ReportTraining['weeks'] = [];
  for (let from = mondayOf(range.from); from <= range.to; from = addDays(from, 7)) {
    const inWeek = between(done, from, addDays(from, 6));
    weeks.push({
      from,
      count: inWeek.length,
      minutes: inWeek.reduce((s, w) => s + w.durationMin, 0),
    });
  }
  return {
    done: done.length,
    minutes: done.reduce((s, w) => s + w.durationMin, 0),
    perWeek: days > 0 ? (done.length * 7) / days : 0,
    weeks,
  };
}

function stepsOf(input: ReportInput, range: ReportRange): ReportSteps {
  const steps = between(dailySteps(input.steps), range.from, range.to);
  return {
    average: mean(steps.map((d) => d.steps)),
    days: steps.length,
    points: steps.map((d) => ({ date: d.date, value: d.steps })),
  };
}

export function buildReport(
  input: ReportInput,
  range: ReportRange,
  today: string,
  fiber: FiberSource | null = null,
): Report {
  const days = daysBetween(range.from, range.to) + 1;
  return {
    ...range,
    days,
    basics: basicsOf(input, range),
    weight: weightOf(input, range),
    waist: waistOf(input, range),
    glp1: glp1Of(input, range, today),
    diet: dietOf(input, range, days, fiber),
    supplements: supplementsOf(input, range),
    training: trainingOf(input, range, days),
    steps: stepsOf(input, range),
  };
}

/** Första och senaste fototillfället i perioden (samma om bara ett finns). */
export function reportPhotoSessions(
  sessions: readonly PhotoSession[],
  range: ReportRange,
): PhotoSession[] {
  const inRange = between(sessions, range.from, range.to).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt,
  );
  const first = inRange[0];
  const last = inRange.at(-1);
  if (!first || !last) return [];
  return first === last ? [first] : [first, last];
}

/** "Wegovy 0,5 mg" för dostidslinjen. */
export function doseRowText(row: ReportDoseRow): string {
  return `${row.medicationName} ${formatMg(row.doseMg)}`;
}
