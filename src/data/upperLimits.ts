/**
 * Övre gränsvärden för intag (Tolerable Upper Intake Level, UL) för vuxna enligt
 * Europeiska livsmedelssäkerhetsmyndigheten (EFSA). Värdena gäller en genomsnittlig
 * vuxen – inte gravida, ammande eller barn – och i näringsämnets egen enhet
 * (se `src/data/nutrients.ts`).
 *
 * Källa: EFSA, "Overview on Tolerable Upper Intake Levels as derived by the Scientific
 * Committee on Food (SCF) and the EFSA Panel on Nutrition, Novel Foods and Food
 * Allergens (NDA)", version 11 (2024), samt yttrandena om vitamin D (2023), vitamin B6
 * (2023), selen (2023) och järn (2024).
 *
 * Näringsämnen utan UL (t.ex. vitamin C, K, B1, B2, B12 och kalium) saknas här. Där
 * gränsen bara gäller tillsatt form (folsyra, magnesium som tillskott, niacin)
 * jämförs den bara med tillskotten (`appliesTo: 'supplements'`).
 */
import type { NutrientKey } from './nutrients.ts';

export interface UpperLimit {
  key: NutrientKey;
  /** Per dag, i näringsämnets egen enhet. */
  ul: number;
  /** `total` = mat + tillskott; `supplements` = bara tillskott (och berikning). */
  appliesTo: 'total' | 'supplements';
  /** Kort förbehåll som visas vid varningen. */
  note?: string;
}

export const UPPER_LIMITS_SOURCE = 'EFSA, övre gränsvärden för vuxna (2024)';
export const UPPER_LIMITS_URL =
  'https://www.efsa.europa.eu/sites/default/files/assets/UL_Summary_tables.pdf';

export const UPPER_LIMITS: readonly UpperLimit[] = [
  {
    key: 'vitaminA',
    ul: 3000,
    appliesTo: 'total',
    note: 'Gränsen gäller förformat vitamin A (retinol). Matens värde räknas som retinolekvivalenter och kan därför bli för högt.',
  },
  { key: 'vitaminD', ul: 100, appliesTo: 'total' },
  { key: 'vitaminE', ul: 300, appliesTo: 'total' },
  { key: 'vitaminB6', ul: 12, appliesTo: 'total' },
  {
    key: 'folate',
    ul: 1000,
    appliesTo: 'supplements',
    note: 'Gränsen gäller folsyra i tillskott och berikade livsmedel, inte folat från vanlig mat.',
  },
  {
    key: 'niacin',
    ul: 900,
    appliesTo: 'supplements',
    note: 'Gränsen gäller nikotinamid. För nikotinsyra är gränsen 10 mg per dag.',
  },
  { key: 'calcium', ul: 2500, appliesTo: 'total' },
  {
    key: 'iron',
    ul: 40,
    appliesTo: 'total',
    note: 'EFSA anger 40 mg som säker nivå för vuxna (inget formellt UL).',
  },
  {
    key: 'magnesium',
    ul: 250,
    appliesTo: 'supplements',
    note: 'Gränsen gäller magnesium i tillskott, inte magnesium från mat.',
  },
  { key: 'zinc', ul: 25, appliesTo: 'total' },
  { key: 'selenium', ul: 255, appliesTo: 'total' },
  { key: 'iodine', ul: 600, appliesTo: 'total' },
];

export function upperLimitFor(key: NutrientKey): UpperLimit | undefined {
  return UPPER_LIMITS.find((u) => u.key === key);
}
