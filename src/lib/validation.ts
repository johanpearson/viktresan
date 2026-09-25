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
import { parseDecimal } from './format.ts';
import type { Nutrients } from './nutrition.ts';

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
    return fail('Välj en takt mellan 0,25 och 1 kg/vecka.');
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
  portionName: string;
  portionG: string;
  ean: string;
}

export interface FoodValues {
  name: string;
  per100: Nutrients;
  portionName?: string;
  portionG?: number;
  ean?: string;
}

function parseAmountField(text: string, max: number): number | null {
  if (text.trim() === '') return 0;
  const value = parseDecimal(text);
  return value != null && value >= 0 && value <= max ? value : null;
}

/** Eget livsmedel: namn och näringsvärden per 100 g, valfri portion och streckkod. */
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

  const portionText = fields.portionG.trim();
  if (portionText !== '') {
    const portionG = parseDecimal(portionText);
    if (portionG == null || portionG <= 0 || portionG > 5000)
      return fail('Ange portionens vikt i gram (1–5 000) eller lämna fältet tomt.');
    value.portionG = portionG;
    value.portionName = fields.portionName.trim() || 'portion';
  }
  const eanText = fields.ean.trim();
  if (eanText !== '') {
    const ean = normalizeEan(eanText);
    if (!ean) return fail('Streckkoden är inte giltig (8 eller 13 siffror).');
    value.ean = ean;
  }
  return { ok: true, value };
}

/** Mängd att logga: gram (1–5 000) eller antal portioner (0,1–50). */
export function parseLogAmount(
  text: string,
  unit: 'g' | 'portion',
  portionG?: number,
): Parsed<{ grams: number; portionCount?: number }> {
  const value = parseDecimal(text);
  if (unit === 'portion') {
    if (portionG == null) return fail('Livsmedlet saknar portionsstorlek – ange gram.');
    if (value == null || value <= 0 || value > 50) return fail('Ange antal portioner (0,1–50).');
    return {
      ok: true,
      value: { grams: Math.round(value * portionG * 10) / 10, portionCount: value },
    };
  }
  if (value == null || value <= 0 || value > 5000) return fail('Ange mängd i gram (1–5 000).');
  return { ok: true, value: { grams: value } };
}
