/** Svensk formatering och tolkning av tal och datum. */
import { toDayNumber } from './dates.ts';

const kgFormat = new Intl.NumberFormat('sv-SE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const cmFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });
const intFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortDateFormat = new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** sv-SE använder hårda mellanslag som tusentalsavgränsare; gör dem till vanliga. */
function normalizeSpaces(text: string): string {
  return text.replace(/[\u00a0\u202f]/g, ' ');
}

/** 81.46 → "81,5 kg". Med `signed` får positiva värden "+". */
export function formatKg(value: number, { signed = false } = {}): string {
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  // Undvik "−0,0 kg".
  const safe = Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
  const text = normalizeSpaces(kgFormat.format(safe));
  return `${signed && safe > 0 ? '+' : ''}${text} kg`;
}

/** 92.5 → "92,5 cm", 90 → "90 cm". */
export function formatCm(value: number): string {
  return `${normalizeSpaces(cmFormat.format(value))} cm`;
}

export function formatInt(value: number): string {
  return normalizeSpaces(intFormat.format(value));
}

export function formatBmi(value: number): string {
  return normalizeSpaces(kgFormat.format(value));
}

/** "2026-09-25" → "25 sep. 2026" (beroende på Intl-data). */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(toDayNumber(iso) * 86_400_000));
}

/** "2026-09-25" → "25 sep." – utan år, för korta intervall. */
export function formatShortDate(iso: string): string {
  return shortDateFormat.format(new Date(toDayNumber(iso) * 86_400_000));
}

/**
 * Tolkar ett tal skrivet med komma eller punkt ("81,5", " 81.5 ").
 * Returnerar `null` för tom eller ogiltig inmatning.
 */
export function parseDecimal(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

/** Ökar/minskar en vikt och avrundar till en decimal. */
export function stepKg(value: number, delta: number): number {
  return Math.round((value + delta + Number.EPSILON) * 10) / 10;
}

/** Bildtext för en progressbild: "25 sep. 2026 · 84,2 kg" (vikten är valfri). */
export function formatPhotoLabel(photo: { date: string; weightKg?: number }): string {
  const date = formatDate(photo.date);
  return photo.weightKg == null ? date : `${date} · ${formatKg(photo.weightKg)}`;
}

/** 1234.4 → "1 234 kcal". */
export function formatKcal(value: number): string {
  const rounded = Math.round(value);
  return `${formatInt(rounded === 0 ? 0 : rounded)} kcal`;
}

const gramFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

/** 7.84 → "7,8 g", 60 → "60 g". */
export function formatGrams(value: number): string {
  return `${normalizeSpaces(gramFormat.format(value))} g`;
}

/** 0.5 → "0,5 kg/vecka". Två decimaler vid behov (0,25). */
export function formatRate(kgPerWeek: number): string {
  const text = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(
    Math.round(kgPerWeek * 100) / 100,
  );
  return `${normalizeSpaces(text)} kg/vecka`;
}

/** "0,5" → "0,5"; tal till text med decimalkomma för formulärfält. */
export function decimalInput(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',');
}

/** 1250 → "1 250 ml". */
export function formatMl(value: number): string {
  return `${formatInt(Math.round(value))} ml`;
}

const mgFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });

/** 0.25 → "0,25 mg", 2.4 → "2,4 mg". */
export function formatMg(value: number): string {
  return `${normalizeSpaces(mgFormat.format(value))} mg`;
}

/** Tal till text med decimalkomma, upp till två decimaler (doser: "0,25"). */
export function doseInput(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',');
}
