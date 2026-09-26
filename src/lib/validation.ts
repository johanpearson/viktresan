/** Validering av formulärinmatning. Returnerar värdet eller ett felmeddelande på svenska. */
import { isIsoDate } from './dates.ts';
import {
  ACTIVITY_LEVELS,
  DEFAULT_RATE_KG,
  RATE_OPTIONS,
  type ActivityLevel,
  type Sex,
} from './energy.ts';
import { normalizeEan } from './barcode.ts';
import {
  APPETITE_MAX,
  APPETITE_MIN,
  DOSE_FREQUENCIES,
  isInjectionSite,
  type DoseFrequency,
  type InjectionSite,
} from './glp1.ts';
import { parseDecimal } from './format.ts';
import type { Nutrients } from './nutrition.ts';
import { WATER_ENTRY_MAX_ML, WATER_GOAL_MAX_ML, WATER_GOAL_MIN_ML } from './water.ts';
import { INTENSITIES, WORKOUT_STATUSES, type Intensity, type WorkoutStatus } from './workouts.ts';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ProfileFields {
  startDate: string;
  startWeight: string;
  height: string;
  goalWeight: string;
  goalDate: string;
  /** '' = ej angivet. */
  sex?: '' | Sex;
  birthYear?: string;
  activityLevel?: '' | ActivityLevel;
  /** Takt i kg/vecka som text, t.ex. "0.5". */
  rate?: string;
}

export interface ProfileValues {
  startDate: string;
  startWeightKg: number;
  heightCm: number;
  goalWeightKg: number;
  goalDate?: string;
  sex?: Sex;
  birthYear?: number;
  activityLevel?: ActivityLevel;
  ratePerWeekKg: number;
}

const WEIGHT_MIN = 20;
const WEIGHT_MAX = 400;

function isWeight(value: number | null): value is number {
  return value != null && value >= WEIGHT_MIN && value <= WEIGHT_MAX;
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function parseProfile(fields: ProfileFields): Parsed<ProfileValues> {
  const startWeightKg = parseDecimal(fields.startWeight);
  const heightCm = parseDecimal(fields.height);
  const goalWeightKg = parseDecimal(fields.goalWeight);
  const goalDate = fields.goalDate.trim();
  if (!isIsoDate(fields.startDate)) return fail('Ange ett giltigt startdatum.');
  if (!isWeight(startWeightKg)) return fail('Ange startvikt i kg (20–400).');
  if (heightCm == null || heightCm < 100 || heightCm > 250)
    return fail('Ange längd i cm (100–250).');
  if (!isWeight(goalWeightKg)) return fail('Ange målvikt i kg (20–400).');
  if (goalDate !== '' && !isIsoDate(goalDate)) return fail('Ange ett giltigt måldatum.');
  if (goalDate !== '' && goalDate <= fields.startDate)
    return fail('Måldatum måste ligga efter startdatum.');

  const birthText = (fields.birthYear ?? '').trim();
  const birthYear = Number(birthText);
  const startYear = Number(fields.startDate.slice(0, 4));
  if (
    birthText !== '' &&
    (!/^\d{4}$/.test(birthText) || birthYear > startYear - 13 || birthYear < startYear - 110)
  ) {
    return fail(`Ange födelseår med fyra siffror (${startYear - 110}–${startYear - 13}).`);
  }
  const rateText = (fields.rate ?? '').trim();
  const ratePerWeekKg = rateText === '' ? DEFAULT_RATE_KG : Number(rateText);
  if (!RATE_OPTIONS.includes(ratePerWeekKg))
    return fail('Välj en takt mellan 0 (håll vikten) och 1 kg/vecka.');
  const activity = ACTIVITY_LEVELS.find((a) => a.id === fields.activityLevel)?.id;
  const sex = fields.sex === 'man' || fields.sex === 'kvinna' ? fields.sex : undefined;

  return {
    ok: true,
    value: {
      startDate: fields.startDate,
      startWeightKg,
      heightCm,
      goalWeightKg,
      ...(goalDate !== '' ? { goalDate } : {}),
      ...(sex ? { sex } : {}),
      ...(birthText !== '' ? { birthYear } : {}),
      ...(activity ? { activityLevel: activity } : {}),
      ratePerWeekKg,
    },
  };
}

export interface WeightFields {
  date: string;
  weight: string;
  note: string;
}

export interface WeightValues {
  date: string;
  weightKg: number;
  note?: string;
}

export function parseWeightFields(fields: WeightFields): Parsed<WeightValues> {
  if (!isIsoDate(fields.date)) return fail('Ange ett giltigt datum.');
  const weightKg = parseDecimal(fields.weight);
  if (!isWeight(weightKg)) return fail('Ange vikt i kg (20–400).');
  const value: WeightValues = { date: fields.date, weightKg };
  const note = fields.note.trim();
  if (note !== '') value.note = note;
  return { ok: true, value };
}

export function parseWaistFields(fields: { date: string; waist: string }): Parsed<{
  date: string;
  waistCm: number;
}> {
  if (!isIsoDate(fields.date)) return fail('Ange ett giltigt datum.');
  const waistCm = parseDecimal(fields.waist);
  if (waistCm == null || waistCm < 30 || waistCm > 300)
    return fail('Ange midjemått i cm (30–300).');
  return { ok: true, value: { date: fields.date, waistCm } };
}

export function parseStepsFields(fields: { date: string; steps: string }): Parsed<{
  date: string;
  steps: number;
}> {
  if (!isIsoDate(fields.date)) return fail('Ange ett giltigt datum.');
  const text = fields.steps.trim().replace(/\s/g, '');
  const steps = Number(text);
  if (text === '' || !Number.isInteger(steps) || steps < 0 || steps > 200_000)
    return fail('Ange steg som ett heltal (0–200 000).');
  return { ok: true, value: { date: fields.date, steps } };
}

export interface PhotoFields {
  date: string;
  weight: string;
}

export interface PhotoValues {
  date: string;
  weightKg?: number;
}

/** Datum och valfri vikt för en progressbild. */
export function parsePhotoFields(fields: PhotoFields): Parsed<PhotoValues> {
  if (!isIsoDate(fields.date)) return fail('Ange ett giltigt datum.');
  if (fields.weight.trim() === '') return { ok: true, value: { date: fields.date } };
  const weightKg = parseDecimal(fields.weight);
  if (!isWeight(weightKg)) return fail('Ange vikt i kg (20–400) eller lämna fältet tomt.');
  return { ok: true, value: { date: fields.date, weightKg } };
}

export interface FoodFields {
  name: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  ean: string;
}

export interface FoodValues {
  name: string;
  per100: Nutrients;
  ean?: string;
}

function parseAmountField(text: string, max: number): number | null {
  if (text.trim() === '') return 0;
  const value = parseDecimal(text);
  return value != null && value >= 0 && value <= max ? value : null;
}

/** Eget livsmedel: namn och näringsvärden per 100 g och valfri streckkod. */
export function parseFoodFields(fields: FoodFields): Parsed<FoodValues> {
  const name = fields.name.trim();
  if (name === '' || name.length > 120) return fail('Ange ett namn (högst 120 tecken).');
  const kcal = parseDecimal(fields.kcal);
  if (kcal == null || kcal < 0 || kcal > 900) return fail('Ange energi i kcal per 100 g (0–900).');
  const proteinG = parseAmountField(fields.protein, 100);
  const carbsG = parseAmountField(fields.carbs, 100);
  const fatG = parseAmountField(fields.fat, 100);
  if (proteinG == null || carbsG == null || fatG == null)
    return fail('Ange protein, kolhydrater och fett i gram per 100 g (0–100).');
  if (proteinG + carbsG + fatG > 100)
    return fail('Protein, kolhydrater och fett kan inte vara mer än 100 g tillsammans.');
  const value: FoodValues = { name, per100: { kcal, proteinG, carbsG, fatG } };

  const eanText = fields.ean.trim();
  if (eanText !== '') {
    const ean = normalizeEan(eanText);
    if (!ean) return fail('Streckkoden är inte giltig (8 eller 13 siffror).');
    value.ean = ean;
  }
  return { ok: true, value };
}

function parseWholeNumber(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '');
  if (!/^\d+$/.test(clean)) return null;
  return Number(clean);
}

/** En vattenpost i ml (1–3 000). */
export function parseWaterAmount(text: string): Parsed<number> {
  const ml = parseWholeNumber(text);
  if (ml == null || ml < 1 || ml > WATER_ENTRY_MAX_ML)
    return fail(`Ange mängd i ml (1–${formatThousands(WATER_ENTRY_MAX_ML)}).`);
  return { ok: true, value: ml };
}

/** Eget vattenmål i ml. Tomt = standardmålet (`null`). */
export function parseWaterGoal(text: string): Parsed<number | null> {
  if (text.trim() === '') return { ok: true, value: null };
  const ml = parseWholeNumber(text);
  if (ml == null || ml < WATER_GOAL_MIN_ML || ml > WATER_GOAL_MAX_ML) {
    return fail(
      `Ange ett mål i ml (${formatThousands(WATER_GOAL_MIN_ML)}–${formatThousands(WATER_GOAL_MAX_ML)}) eller lämna fältet tomt.`,
    );
  }
  return { ok: true, value: ml };
}

function formatThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTime(value: string): boolean {
  return TIME.test(value);
}

function parseType(text: string): string | null {
  const type = text.trim();
  return type === '' || type.length > 60 ? null : type;
}

function parseDuration(text: string): number | null {
  const min = parseWholeNumber(text);
  return min == null || min < 1 || min > 600 ? null : min;
}

function parseIntensity(value: string): Intensity | undefined {
  return INTENSITIES.find((i) => i.id === value)?.id;
}

export interface WorkoutFields {
  date: string;
  /** '' = hela dagen. */
  time: string;
  type: string;
  duration: string;
  /** '' = ej angiven. */
  intensity: string;
  note: string;
  status: string;
}

export interface WorkoutValues {
  date: string;
  time?: string;
  type: string;
  durationMin: number;
  intensity?: Intensity;
  note?: string;
  status: WorkoutStatus;
}

export function parseWorkoutFields(fields: WorkoutFields): Parsed<WorkoutValues> {
  if (!isIsoDate(fields.date)) return fail('Ange ett giltigt datum.');
  const time = fields.time.trim();
  if (time !== '' && !isTime(time)) return fail('Ange tid som TT:MM eller lämna fältet tomt.');
  const type = parseType(fields.type);
  if (type == null) return fail('Ange typ av pass (högst 60 tecken).');
  const durationMin = parseDuration(fields.duration);
  if (durationMin == null) return fail('Ange längd i minuter (1–600).');
  const status = WORKOUT_STATUSES.find((s) => s.id === fields.status)?.id;
  if (!status) return fail('Välj status.');
  const value: WorkoutValues = { date: fields.date, type, durationMin, status };
  if (time !== '') value.time = time;
  const intensity = parseIntensity(fields.intensity);
  if (intensity) value.intensity = intensity;
  const note = fields.note.trim();
  if (note !== '') value.note = note.slice(0, 500);
  return { ok: true, value };
}

export interface PlanFields {
  type: string;
  weekdays: readonly number[];
  time: string;
  duration: string;
  intensity: string;
  startDate: string;
  endDate: string;
}

export interface PlanValues {
  type: string;
  weekdays: number[];
  time: string;
  durationMin: number;
  intensity?: Intensity;
  startDate: string;
  endDate?: string;
}

/** Återkommande schema: minst en veckodag och en tid. */
export function parsePlanFields(fields: PlanFields): Parsed<PlanValues> {
  const type = parseType(fields.type);
  if (type == null) return fail('Ange typ av pass (högst 60 tecken).');
  const weekdays = [...new Set(fields.weekdays)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  if (weekdays.length === 0) return fail('Välj minst en veckodag.');
  if (!isTime(fields.time.trim())) return fail('Ange tid som TT:MM.');
  const durationMin = parseDuration(fields.duration);
  if (durationMin == null) return fail('Ange längd i minuter (1–600).');
  if (!isIsoDate(fields.startDate)) return fail('Ange ett giltigt startdatum.');
  const endDate = fields.endDate.trim();
  if (endDate !== '' && !isIsoDate(endDate)) return fail('Ange ett giltigt slutdatum.');
  if (endDate !== '' && endDate < fields.startDate)
    return fail('Slutdatum kan inte ligga före startdatum.');
  const value: PlanValues = {
    type,
    weekdays,
    time: fields.time.trim(),
    durationMin,
    startDate: fields.startDate,
  };
  const intensity = parseIntensity(fields.intensity);
  if (intensity) value.intensity = intensity;
  if (endDate !== '') value.endDate = endDate;
  return { ok: true, value };
}

/** Faktisk längd när ett pass bockas av. */
export function parseDurationField(text: string): Parsed<number> {
  const min = parseDuration(text);
  return min == null ? fail('Ange längd i minuter (1–600).') : { ok: true, value: min };
}

/** Största dos som går att skriva in (mg). Ingen rimlighetsbedömning – bara skydd mot felskrivning. */
export const DOSE_MAX_MG = 100;

/** Dos i mg: större än 0 och högst 100, med komma eller punkt. */
export function parseDose(text: string): number | null {
  const dose = parseDecimal(text);
  return dose == null || dose <= 0 || dose > DOSE_MAX_MG ? null : dose;
}

export interface MedicationFields {
  name: string;
  frequency: string;
  /** Veckodag som text ("0"–"6"), används bara veckovis. */
  weekday: string;
  time: string;
  steps: readonly { date: string; dose: string }[];
  /** '' = tills vidare. */
  endDate: string;
}

export interface MedicationValues {
  name: string;
  frequency: DoseFrequency;
  weekday?: number;
  time: string;
  steps: { date: string; doseMg: number }[];
  endDate?: string;
}

/** Läkemedel med schema och dostrappa (minst ett steg, unika datum). */
export function parseMedicationFields(fields: MedicationFields): Parsed<MedicationValues> {
  const name = fields.name.trim();
  if (name === '' || name.length > 60) return fail('Ange läkemedlets namn (högst 60 tecken).');
  const frequency = DOSE_FREQUENCIES.find((f) => f.id === fields.frequency)?.id;
  if (!frequency) return fail('Välj hur ofta du tar dosen.');
  const weekday = Number(fields.weekday);
  if (frequency === 'vecka' && !(fields.weekday !== '' && weekday >= 0 && weekday <= 6))
    return fail('Välj veckodag.');
  if (!isTime(fields.time.trim())) return fail('Ange tid som TT:MM.');
  if (fields.steps.length === 0) return fail('Lägg in minst ett steg i dostrappan.');
  const steps: { date: string; doseMg: number }[] = [];
  for (const [i, step] of fields.steps.entries()) {
    const n = String(i + 1);
    if (!isIsoDate(step.date)) return fail(`Ange datum för steg ${n} i dostrappan.`);
    const doseMg = parseDose(step.dose);
    if (doseMg == null) return fail(`Ange dos i mg för steg ${n} (större än 0, högst 100).`);
    if (steps.some((s) => s.date === step.date))
      return fail('Två steg i dostrappan har samma datum.');
    steps.push({ date: step.date, doseMg });
  }
  steps.sort((a, b) => (a.date < b.date ? -1 : 1));
  const endDate = fields.endDate.trim();
  if (endDate !== '' && !isIsoDate(endDate)) return fail('Ange ett giltigt slutdatum.');
  const start = steps[0]?.date ?? '';
  if (endDate !== '' && endDate < start)
    return fail('Slutdatum kan inte ligga före dostrappans första steg.');
  const value: MedicationValues = { name, frequency, time: fields.time.trim(), steps };
  if (frequency === 'vecka') value.weekday = weekday;
  if (endDate !== '') value.endDate = endDate;
  return { ok: true, value };
}

export interface InjectionFields {
  date: string;
  /** '' = ingen tid. */
  time: string;
  dose: string;
  /** '' = ej angivet. */
  site: string;
}

export interface InjectionValues {
  date: string;
  time?: string;
  doseMg: number;
  site?: InjectionSite;
}

export function parseInjectionFields(fields: InjectionFields): Parsed<InjectionValues> {
  if (!isIsoDate(fields.date)) return fail('Ange ett giltigt datum.');
  const time = fields.time.trim();
  if (time !== '' && !isTime(time)) return fail('Ange tid som TT:MM eller lämna fältet tomt.');
  const doseMg = parseDose(fields.dose);
  if (doseMg == null) return fail('Ange dos i mg (större än 0, högst 100).');
  const value: InjectionValues = { date: fields.date, doseMg };
  if (time !== '') value.time = time;
  if (fields.site !== '') {
    if (!isInjectionSite(fields.site)) return fail('Välj injektionsställe.');
    value.site = fields.site;
  }
  return { ok: true, value };
}

export interface SymptomFields {
  date: string;
  /** '' = ej angiven. */
  appetite: string;
  sideEffects: readonly string[];
  /** Egen biverkning i fritext. */
  other: string;
}

export interface SymptomValues {
  date: string;
  appetite?: number;
  sideEffects: string[];
}

/** Aptit (1–5) och/eller biverkningar – minst det ena. */
export function parseSymptomFields(fields: SymptomFields): Parsed<SymptomValues> {
  if (!isIsoDate(fields.date)) return fail('Ange ett giltigt datum.');
  const appetite = Number(fields.appetite);
  if (
    fields.appetite !== '' &&
    !(Number.isInteger(appetite) && appetite >= APPETITE_MIN && appetite <= APPETITE_MAX)
  )
    return fail('Välj aptit 1–5.');
  const other = fields.other.trim();
  if (other.length > 100) return fail('Skriv högst 100 tecken under Annat.');
  const sideEffects = [...new Set([...fields.sideEffects, ...(other ? [other] : [])])];
  if (fields.appetite === '' && sideEffects.length === 0)
    return fail('Välj aptit eller minst en biverkning.');
  const value: SymptomValues = { date: fields.date, sideEffects };
  if (fields.appetite !== '') value.appetite = appetite;
  return { ok: true, value };
}
