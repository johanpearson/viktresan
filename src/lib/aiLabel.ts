/**
 * "Lägg in med AI från etikett": en prompt som ber en AI-tjänst läsa en bild av
 * näringsdeklarationen och svara ENDAST med JSON enligt ett schema, och validering av
 * svaret som användaren klistrar in. Appen gör inga anrop själv – användaren kopierar
 * eller delar prompten, fotar etiketten i AI-tjänsten och klistrar in svaret.
 *
 * Två scheman: tillskott (näringsämnen per dos) och livsmedel (per 100 g/ml, med valfri fiber,
 * socker och portionsstorlek).
 */
import type { NutrientKey } from '../data/nutrients.ts';
import type { SupplementForm, SupplementNutrient } from '../db/db.ts';
import { nutrientInfo, parseAmountUnit, SUPPLEMENT_NUTRIENTS } from './nutrientUnits.ts';
import { SUPPLEMENT_FORMS } from './supplements.ts';

export type AiLabelKind = 'tillskott' | 'livsmedel';

// ---------------------------------------------------------------------------
// Prompter

const SUPPLEMENT_EXAMPLE = {
  namn: 'D-vitamin 25 µg',
  enhet: 'tablett',
  mangdPerDos: 1,
  naringsamnen: [
    { amne: 'vitaminD', mangd: 25, enhet: 'µg' },
    { amne: 'calcium', mangd: 200, enhet: 'mg' },
  ],
};

const FOOD_EXAMPLE = {
  namn: 'Knäckebröd råg',
  energiKcal: 350,
  proteinG: 9,
  kolhydraterG: 62,
  fettG: 2,
  fiberG: 16,
  sockerG: 1.5,
  portionG: 12,
};

/** Prompt för ett tillskott. Tillåtna ämnen och enheter räknas upp i prompten. */
export function supplementLabelPrompt(ean?: string): string {
  const nutrients = SUPPLEMENT_NUTRIENTS.map(
    (n) => `- ${n.key} (${n.label}, ${n.key === 'vitaminD' ? 'µg eller IE' : n.unit})`,
  ).join('\n');
  return [
    'Jag bifogar en bild av näringsdeklarationen på ett kosttillskott. Läs av den och svara ENDAST med ett JSON-objekt – ingen annan text, ingen förklaring och inga kodblock.',
    '',
    'Schema:',
    '{',
    '  "namn": string (produktens namn),',
    `  "enhet": ett av ${SUPPLEMENT_FORMS.map((f) => `"${f.id}"`).join(', ')},`,
    '  "mangdPerDos": tal (antal tabletter, kapslar, droppar eller ml per dos),',
    '  "naringsamnen": [{ "amne": id ur listan nedan, "mangd": tal, "enhet": "mg" | "µg" | "IE" }]',
    '}',
    '',
    'Mängderna gäller EN dos enligt etiketten (inte per 100 g). Ta bara med näringsämnen ur listan:',
    nutrients,
    '',
    'Hoppa över allt annat (t.ex. omega-3, biotin, fyllnadsmedel). Använd punkt som decimaltecken.',
    ean ? `Streckkoden är ${ean} (för din information, ta inte med den).` : '',
    '',
    `Exempel: ${JSON.stringify(SUPPLEMENT_EXAMPLE)}`,
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n');
}

/** Prompt för ett livsmedel (värden per 100 g, för drycker per 100 ml). */
export function foodLabelPrompt(ean?: string): string {
  return [
    'Jag bifogar en bild av näringsdeklarationen på ett livsmedel. Läs av den och svara ENDAST med ett JSON-objekt – ingen annan text, ingen förklaring och inga kodblock.',
    '',
    'Schema:',
    '{',
    '  "namn": string (produktens namn),',
    '  "energiKcal": tal (kcal per 100 g),',
    '  "proteinG": tal (gram per 100 g),',
    '  "kolhydraterG": tal (gram per 100 g),',
    '  "fettG": tal (gram per 100 g),',
    '  "fiberG": tal eller null (gram fiber per 100 g, null om det inte står på etiketten),',
    '  "sockerG": tal eller null (varav sockerarter, gram per 100 g, null om det saknas),',
    '  "portionG": tal eller null (en portion i gram eller ml enligt etiketten, null om den saknas)',
    '}',
    '',
    'Värdena gäller per 100 g (för drycker per 100 ml), inte per portion – bara portionG gäller en portion. Använd punkt som decimaltecken.',
    ean ? `Streckkoden är ${ean} (för din information, ta inte med den).` : '',
    '',
    `Exempel: ${JSON.stringify(FOOD_EXAMPLE)}`,
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n');
}

// ---------------------------------------------------------------------------
// Validering

export type LabelResult<T> =
  { ok: true; value: T; warnings: string[] } | { ok: false; error: string };

export interface SupplementLabel {
  name: string;
  form: SupplementForm;
  amountPerDose: number;
  /** I angiven enhet (IE för D-vitamin sparas som IE). */
  nutrients: SupplementNutrient[];
}

export interface FoodLabel {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Fiber och socker per 100 g när etiketten anger dem. */
  fiberG?: number;
  sugarG?: number;
  /** En portion i gram (eller ml) enligt etiketten. */
  portionG?: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Plockar ut JSON-objektet ur svaret. AI-tjänster lägger ibland till kodblock (```json)
 * eller en mening före – det mellan första `{` och sista `}` används.
 */
export function extractJson(text: string): LabelResult<Record<string, unknown>> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (text.trim() === '') return { ok: false, error: 'Klistra in AI-tjänstens svar först.' };
  if (start === -1) {
    return {
      ok: false,
      error: 'Svaret innehåller ingen JSON. Be AI-tjänsten svara enbart med JSON enligt prompten.',
    };
  }
  let parsed: unknown;
  try {
    // Saknas avslutande } blir det ett parsningsfel nedan (svaret kom inte med helt).
    parsed = JSON.parse(end < start ? text.slice(start) : text.slice(start, end + 1));
  } catch {
    return {
      ok: false,
      error:
        'Svaret är inte giltig JSON. Kontrollera att hela svaret kom med, eller be AI-tjänsten svara igen.',
    };
  }
  if (!isRecord(parsed)) return { ok: false, error: 'Svaret ska vara ett JSON-objekt.' };
  return { ok: true, value: parsed, warnings: [] };
}

/** Ett tal ≥ 0 – även "12,5" som text, eftersom AI-tjänster ibland citerar tal. */
function number(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && /^\s*\d+([.,]\d+)?\s*$/.test(value)) {
    return Number(value.trim().replace(',', '.'));
  }
  return null;
}

function name(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, 120);
  return text === '' ? null : text;
}

/** Matchar ett ämne: id ur listan ("vitaminD") eller namnet ("Vitamin D", "D-vitamin", "Zink"). */
export function matchNutrient(value: string): NutrientKey | null {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9åäö]/g, '');
  const text = norm(value);
  for (const n of SUPPLEMENT_NUTRIENTS) {
    if (norm(n.key) === text || norm(n.label) === text) return n.key;
    // "Tiamin (B1)" → "tiamin" och "b1"; "D-vitamin" → "vitamind".
    const [main = '', paren = ''] = n.label.split('(');
    if (norm(main) === text || (paren !== '' && norm(paren) === text)) return n.key;
    if (n.key.startsWith('vitamin') && text === `${n.key.slice(7).toLowerCase()}vitamin`) {
      return n.key;
    }
  }
  return null;
}

export function parseSupplementLabel(text: string): LabelResult<SupplementLabel> {
  const json = extractJson(text);
  if (!json.ok) return json;
  const v = json.value;
  const missing = ['namn', 'enhet', 'mangdPerDos', 'naringsamnen'].filter((k) => !(k in v));
  if (missing.length > 0) {
    return { ok: false, error: `Fält saknas i svaret: ${missing.join(', ')}.` };
  }
  const productName = name(v.namn);
  if (productName === null) return { ok: false, error: '"namn" ska vara en text.' };
  const form = SUPPLEMENT_FORMS.find(
    (f) =>
      typeof v.enhet === 'string' && [f.id, f.one, f.many].includes(v.enhet.trim().toLowerCase()),
  );
  if (!form) {
    return {
      ok: false,
      error: `"enhet" ska vara en av ${SUPPLEMENT_FORMS.map((f) => f.id).join(', ')}.`,
    };
  }
  const amountPerDose = number(v.mangdPerDos);
  if (amountPerDose === null || amountPerDose === 0) {
    return { ok: false, error: '"mangdPerDos" ska vara ett tal större än 0.' };
  }
  if (!Array.isArray(v.naringsamnen)) {
    return { ok: false, error: '"naringsamnen" ska vara en lista.' };
  }
  const nutrients: SupplementNutrient[] = [];
  const warnings: string[] = [];
  for (const [i, raw] of (v.naringsamnen as unknown[]).entries()) {
    const label = `Näringsämne ${String(i + 1)}`;
    if (!isRecord(raw)) return { ok: false, error: `${label} ska vara ett objekt.` };
    const missingFields = ['amne', 'mangd', 'enhet'].filter((k) => !(k in raw));
    if (missingFields.length > 0) {
      return { ok: false, error: `${label}: fält saknas: ${missingFields.join(', ')}.` };
    }
    const key = typeof raw.amne === 'string' ? matchNutrient(raw.amne) : null;
    if (key === null) {
      warnings.push(`Hoppade över "${String(raw.amne)}" – finns inte i listan.`);
      continue;
    }
    const info = nutrientInfo(key);
    const amount = number(raw.mangd);
    if (amount === null) return { ok: false, error: `${info.label}: "mangd" ska vara ett tal.` };
    const unit = typeof raw.enhet === 'string' ? parseAmountUnit(raw.enhet) : null;
    if (unit === null || unit === 'g' || (unit === 'IE' && key !== 'vitaminD')) {
      const allowed = key === 'vitaminD' ? 'µg eller IE' : 'mg eller µg';
      return {
        ok: false,
        error: `${info.label}: fel enhet "${String(raw.enhet)}" – använd ${allowed}.`,
      };
    }
    if (nutrients.some((n) => n.key === key)) {
      warnings.push(`${info.label} fanns två gånger – den första används.`);
      continue;
    }
    // Enheten behålls som på etiketten (mg ↔ µg räknas om vid summeringen); IE för D-vitamin.
    nutrients.push({ key, amount, unit });
  }
  return {
    ok: true,
    value: { name: productName, form: form.id, amountPerDose, nutrients },
    warnings,
  };
}

export function parseFoodLabel(text: string): LabelResult<FoodLabel> {
  const json = extractJson(text);
  if (!json.ok) return json;
  const v = json.value;
  const fields = ['namn', 'energiKcal', 'proteinG', 'kolhydraterG', 'fettG'] as const;
  const missing = fields.filter((k) => !(k in v));
  if (missing.length > 0) {
    return { ok: false, error: `Fält saknas i svaret: ${missing.join(', ')}.` };
  }
  const productName = name(v.namn);
  if (productName === null) return { ok: false, error: '"namn" ska vara en text.' };
  const values = fields.slice(1).map((k) => [k, number(v[k])] as const);
  const bad = values.find(([, n]) => n === null);
  if (bad) return { ok: false, error: `"${bad[0]}" ska vara ett tal (0 eller mer).` };
  const [kcal = 0, proteinG = 0, carbsG = 0, fatG = 0] = values.map(([, n]) => n ?? 0);
  if (kcal > 900 || proteinG + carbsG + fatG > 100) {
    return {
      ok: false,
      error: 'Värdena verkar inte gälla per 100 g (för höga). Be AI-tjänsten räkna om per 100 g.',
    };
  }
  const value: FoodLabel = { name: productName, kcal: Math.round(kcal), proteinG, carbsG, fatG };
  const warnings: string[] = [];
  // Valfria fält: saknas eller null = står inte på etiketten.
  const optional = [
    ['fiberG', 'fiberG'],
    ['sockerG', 'sugarG'],
    ['portionG', 'portionG'],
  ] as const;
  for (const [field, key] of optional) {
    const raw = v[field];
    if (raw === undefined || raw === null) continue;
    const n = number(raw);
    if (n === null) {
      warnings.push(`Hoppade över "${field}" – inte ett tal.`);
      continue;
    }
    if (key === 'portionG') {
      if (n > 0 && n <= 5000) value.portionG = n;
      else warnings.push('Hoppade över "portionG" – orimlig portion.');
      continue;
    }
    if (n > 100) {
      warnings.push(`Hoppade över "${field}" – över 100 g per 100 g.`);
      continue;
    }
    value[key] = n;
  }
  return { ok: true, value, warnings };
}
