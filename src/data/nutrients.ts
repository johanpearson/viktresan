/**
 * Näringsämnen utöver energi och makron som hämtas ur Livsmedelsverkets databas
 * (`npm run livsmedel`) och visas i måltidsanalysen.
 *
 * Referensintag (RI) för vuxna enligt EU:s förordning 1169/2011, bilaga XIII
 * (samma värden som "% av RI" på förpackningar). Fiber har inget RI – där används
 * den nordiska rekommendationen (NNR 2023: minst 25 g per dag för kvinnor, 35 g
 * för män; här 30 g som mittvärde). Värdena gäller en genomsnittlig vuxen och är
 * inga personliga mål.
 */

export type NutrientKey =
  | 'fiberG'
  | 'sugarG'
  | 'saltG'
  | 'vitaminA'
  | 'vitaminD'
  | 'vitaminE'
  | 'vitaminK'
  | 'thiamin'
  | 'riboflavin'
  | 'niacin'
  | 'vitaminB6'
  | 'folate'
  | 'vitaminB12'
  | 'vitaminC'
  | 'calcium'
  | 'iron'
  | 'magnesium'
  | 'potassium'
  | 'phosphorus'
  | 'zinc'
  | 'selenium'
  | 'iodine';

export type NutrientUnit = 'g' | 'mg' | 'µg';

export type NutrientGroup = 'ovrigt' | 'vitamin' | 'mineral';

export interface NutrientInfo {
  key: NutrientKey;
  label: string;
  unit: NutrientUnit;
  group: NutrientGroup;
  /** Referensintag per dag (se ovan), `null` om inget finns. */
  ri: number | null;
  /** Var RI kommer ifrån när det inte är EU:s referensintag. */
  riSource?: string;
  /** EuroFIR-koden i Livsmedelsverkets API. */
  code: string;
  /** Namnen i API:t (gemener), i tur och ordning om koden saknas. */
  names: readonly string[];
}

export const NUTRIENTS: readonly NutrientInfo[] = [
  {
    key: 'fiberG',
    label: 'Fiber',
    unit: 'g',
    group: 'ovrigt',
    ri: 30,
    riSource: 'NNR',
    code: 'FIBT',
    names: ['fibrer', 'fiber'],
  },
  {
    key: 'sugarG',
    label: 'Socker',
    unit: 'g',
    group: 'ovrigt',
    ri: 90,
    code: 'SUGAR',
    names: ['sockerarter, totalt', 'sockerarter', 'socker totalt'],
  },
  {
    key: 'saltG',
    label: 'Salt',
    unit: 'g',
    group: 'ovrigt',
    ri: 6,
    code: 'NACL',
    names: ['salt, nacl', 'salt'],
  },
  {
    key: 'vitaminA',
    label: 'Vitamin A',
    unit: 'µg',
    group: 'vitamin',
    ri: 800,
    code: 'VITA',
    names: ['vitamin a', 'retinolekvivalenter'],
  },
  {
    key: 'vitaminD',
    label: 'Vitamin D',
    unit: 'µg',
    group: 'vitamin',
    ri: 5,
    code: 'VITD',
    names: ['vitamin d'],
  },
  {
    key: 'vitaminE',
    label: 'Vitamin E',
    unit: 'mg',
    group: 'vitamin',
    ri: 12,
    code: 'VITE',
    names: ['vitamin e', 'alfa-tokoferol'],
  },
  {
    key: 'vitaminK',
    label: 'Vitamin K',
    unit: 'µg',
    group: 'vitamin',
    ri: 75,
    code: 'VITK',
    names: ['vitamin k', 'fyllokinon'],
  },
  {
    key: 'thiamin',
    label: 'Tiamin (B1)',
    unit: 'mg',
    group: 'vitamin',
    ri: 1.1,
    code: 'THIA',
    names: ['tiamin'],
  },
  {
    key: 'riboflavin',
    label: 'Riboflavin (B2)',
    unit: 'mg',
    group: 'vitamin',
    ri: 1.4,
    code: 'RIBF',
    names: ['riboflavin'],
  },
  {
    key: 'niacin',
    label: 'Niacin',
    unit: 'mg',
    group: 'vitamin',
    ri: 16,
    code: 'NIA',
    names: ['niacin'],
  },
  {
    key: 'vitaminB6',
    label: 'Vitamin B6',
    unit: 'mg',
    group: 'vitamin',
    ri: 1.4,
    code: 'VITB6',
    names: ['vitamin b6'],
  },
  {
    key: 'folate',
    label: 'Folat',
    unit: 'µg',
    group: 'vitamin',
    ri: 200,
    code: 'FOL',
    names: ['folat, totalt', 'folat'],
  },
  {
    key: 'vitaminB12',
    label: 'Vitamin B12',
    unit: 'µg',
    group: 'vitamin',
    ri: 2.5,
    code: 'VITB12',
    names: ['vitamin b12'],
  },
  {
    key: 'vitaminC',
    label: 'Vitamin C',
    unit: 'mg',
    group: 'vitamin',
    ri: 80,
    code: 'VITC',
    names: ['vitamin c', 'askorbinsyra'],
  },
  {
    key: 'calcium',
    label: 'Kalcium',
    unit: 'mg',
    group: 'mineral',
    ri: 800,
    code: 'CA',
    names: ['kalcium, ca', 'kalcium'],
  },
  {
    key: 'iron',
    label: 'Järn',
    unit: 'mg',
    group: 'mineral',
    ri: 14,
    code: 'FE',
    names: ['järn, fe', 'järn'],
  },
  {
    key: 'magnesium',
    label: 'Magnesium',
    unit: 'mg',
    group: 'mineral',
    ri: 375,
    code: 'MG',
    names: ['magnesium, mg', 'magnesium'],
  },
  {
    key: 'potassium',
    label: 'Kalium',
    unit: 'mg',
    group: 'mineral',
    ri: 2000,
    code: 'K',
    names: ['kalium, k', 'kalium'],
  },
  {
    key: 'phosphorus',
    label: 'Fosfor',
    unit: 'mg',
    group: 'mineral',
    ri: 700,
    code: 'P',
    names: ['fosfor, p', 'fosfor'],
  },
  {
    key: 'zinc',
    label: 'Zink',
    unit: 'mg',
    group: 'mineral',
    ri: 10,
    code: 'ZN',
    names: ['zink, zn', 'zink'],
  },
  {
    key: 'selenium',
    label: 'Selen',
    unit: 'µg',
    group: 'mineral',
    ri: 55,
    code: 'SE',
    names: ['selen, se', 'selen'],
  },
  {
    key: 'iodine',
    label: 'Jod',
    unit: 'µg',
    group: 'mineral',
    ri: 150,
    code: 'ID',
    names: ['jod, i', 'jod'],
  },
];

export const NUTRIENT_KEYS: readonly NutrientKey[] = NUTRIENTS.map((n) => n.key);

export function isNutrientKey(value: unknown): value is NutrientKey {
  return typeof value === 'string' && (NUTRIENT_KEYS as readonly string[]).includes(value);
}

/**
 * Referensintag för energi och makron (EU 1169/2011) – används för "% av RI" när
 * inget personligt dagsmål finns.
 */
export const MACRO_RI = { kcal: 2000, proteinG: 50, carbsG: 260, fatG: 70 } as const;

/** Extra näringsämnen per 100 g. Saknas en nyckel är värdet okänt. */
export type ExtraNutrients = Partial<Record<NutrientKey, number>>;
