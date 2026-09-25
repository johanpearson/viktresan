/** Validering av formulärinmatning. Returnerar värdet eller ett felmeddelande på svenska. */
import { isIsoDate } from './dates.ts';
import { parseDecimal } from './format.ts';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ProfileFields {
  startDate: string;
  startWeight: string;
  height: string;
  goalWeight: string;
  goalDate: string;
}

export interface ProfileValues {
  startDate: string;
  startWeightKg: number;
  heightCm: number;
  goalWeightKg: number;
  goalDate?: string;
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
  return {
    ok: true,
    value: {
      startDate: fields.startDate,
      startWeightKg,
      heightCm,
      goalWeightKg,
      ...(goalDate !== '' ? { goalDate } : {}),
    },
  };
}

export interface MeasurementFields {
  date: string;
  weight: string;
  waist: string;
  steps: string;
  note: string;
}

export interface MeasurementValues {
  date: string;
  weightKg: number;
  waistCm?: number;
  steps?: number;
  note?: string;
}

export function parseMeasurement(fields: MeasurementFields): Parsed<MeasurementValues> {
  if (!isIsoDate(fields.date)) return fail('Ange ett giltigt datum.');
  const weightKg = parseDecimal(fields.weight);
  if (!isWeight(weightKg)) return fail('Ange vikt i kg (20–400).');

  const value: MeasurementValues = { date: fields.date, weightKg };
  if (fields.waist.trim() !== '') {
    const waistCm = parseDecimal(fields.waist);
    if (waistCm == null || waistCm < 30 || waistCm > 300)
      return fail('Ange midjemått i cm (30–300).');
    value.waistCm = waistCm;
  }
  if (fields.steps.trim() !== '') {
    const steps = Number(fields.steps.trim().replace(/\s/g, ''));
    if (!Number.isInteger(steps) || steps < 0 || steps > 200_000)
      return fail('Ange steg som ett heltal (0–200 000).');
    value.steps = steps;
  }
  const note = fields.note.trim();
  if (note !== '') value.note = note;
  return { ok: true, value };
}
