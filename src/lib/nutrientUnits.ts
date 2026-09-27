/**
 * Enheter för vitaminer och mineraler: omräkning mellan g, mg, µg och – för D-vitamin –
 * internationella enheter (IE). Värden lagras alltid i näringsämnets egen enhet
 * (`NUTRIENTS[…].unit`), så att mat och tillskott kan summeras direkt.
 */
import {
  NUTRIENTS,
  type NutrientInfo,
  type NutrientKey,
  type NutrientUnit,
} from '../data/nutrients.ts';

/** Enheter som kan anges. IE finns bara för D-vitamin. */
export type AmountUnit = NutrientUnit | 'IE';

/** 1 µg D-vitamin (kolekalciferol) = 40 IE. */
export const IU_PER_UG_VITAMIN_D = 40;

const METRIC: Record<NutrientUnit, number> = { g: 1, mg: 1e-3, µg: 1e-6 };

/** Näringsämnen som kan ingå i ett tillskott: vitaminer och mineraler. */
export const SUPPLEMENT_NUTRIENTS: readonly NutrientInfo[] = NUTRIENTS.filter(
  (n) => n.group === 'vitamin' || n.group === 'mineral',
);

export function nutrientInfo(key: NutrientKey): NutrientInfo {
  const info = NUTRIENTS.find((n) => n.key === key);
  if (!info) throw new Error(`Okänt näringsämne: ${key}`);
  return info;
}

/** Enheterna som visas i formuläret: näringsämnets egen, och IE för D-vitamin. */
export function unitsFor(key: NutrientKey): AmountUnit[] {
  const unit = nutrientInfo(key).unit;
  return key === 'vitaminD' ? [unit, 'IE'] : [unit];
}

/** Går enheten att använda för näringsämnet? (IE bara för D-vitamin.) */
export function isUnitAllowed(key: NutrientKey, unit: AmountUnit): boolean {
  return unit !== 'IE' || key === 'vitaminD';
}

/**
 * Tolkar en enhet som den skrivs på etiketter och i AI-svar ("mcg", "ug", "IU", "mg").
 * `null` för okända enheter.
 */
export function parseAmountUnit(text: string): AmountUnit | null {
  const t = text.trim().toLowerCase().replace(/\s/g, '');
  if (t === 'g') return 'g';
  if (t === 'mg') return 'mg';
  if (['µg', 'μg', 'ug', 'mcg', 'mikrogram'].includes(t)) return 'µg';
  if (['ie', 'iu', 'i.e.', 'i.u.'].includes(t)) return 'IE';
  return null;
}

/**
 * Räknar om `value` i `from` till `to` för näringsämnet. `null` om omräkningen inte
 * går (IE för annat än D-vitamin).
 */
export function convertAmount(
  key: NutrientKey,
  value: number,
  from: AmountUnit,
  to: AmountUnit,
): number | null {
  if (from === to) return value;
  if ((from === 'IE' || to === 'IE') && key !== 'vitaminD') return null;
  // Via gram; IE går via µg.
  const grams = from === 'IE' ? (value / IU_PER_UG_VITAMIN_D) * METRIC.µg : value * METRIC[from];
  const result = to === 'IE' ? (grams / METRIC.µg) * IU_PER_UG_VITAMIN_D : grams / METRIC[to];
  // Bort med flyttalsbrus (0,1 mg → 99,99999 µg).
  return Math.round(result * 1e9) / 1e9;
}

/** Till näringsämnets egen enhet (den som lagras och summeras). */
export function toCanonical(key: NutrientKey, value: number, from: AmountUnit): number | null {
  return convertAmount(key, value, from, nutrientInfo(key).unit);
}
