/**
 * Receptimport med AI: en prompt som ber en AI-tjänst läsa ett recept (länk, text eller
 * bild) och svara ENDAST med JSON enligt ett schema, validering av svaret som användaren
 * klistrar in, tolkning av ingrediensrader ("2 dl vetemjöl", "1 burk krossade tomater
 * (400 g)") och matchning mot lokala livsmedel. Appen gör inga anrop själv – varken till
 * receptsajten eller AI-tjänsten. Rena funktioner utan I/O.
 */
import { extractJson, isRecord, type LabelResult } from './aiLabel.ts';
import { normalize, searchIndex, type FoodItem, type SearchIndexEntry } from './foodSearch.ts';
import { recallMatch, type MatchMemory } from './matchMemory.ts';
import { SERVINGS_MAX } from './recipes.ts';
import {
  GRAM,
  MAX_GRAMS,
  MAX_UNIT_AMOUNT,
  foodProfile,
  round1,
  unitsFor,
  volumeMl,
  type FoodUnit,
} from './units.ts';

// ---------------------------------------------------------------------------
// Källan: länk, receptext eller bild

export type RecipeInput =
  { kind: 'url'; url: string } | { kind: 'text'; text: string } | { kind: 'image' };

/** Längsta receptext som tas med i prompten. */
export const RECIPE_TEXT_MAX = 20_000;
export const RECIPE_URL_MAX = 2_000;
export const INGREDIENTS_MAX = 100;

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** Första http(s)-länken i en text, utan skiljetecken efter den ("… här: https://x.se/a."). */
export function findUrl(text: string): string | null {
  const match = URL_RE.exec(text);
  if (!match) return null;
  const url = match[0].replace(/[.,;:!?)\]]+$/, '');
  return isHttpUrl(url) ? url : null;
}

export function isHttpUrl(text: string): boolean {
  if (text.length > RECIPE_URL_MAX) return false;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Webbplatsens namn i en länk ("https://www.ica.se/recept/…" → "ica.se"). */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Det användaren klistrat in eller delat: en länk (även "Kycklinggryta https://…" från
 * delningsmenyn), en receptext eller inget alls (då bifogas en bild i AI-tjänsten).
 */
export function recipeInput(raw: string): RecipeInput {
  const text = raw.trim();
  if (text === '') return { kind: 'image' };
  const url = findUrl(text);
  // Lite text runt länken är en rubrik; ett helt recept med en länk i är en text.
  if (url !== null && text.replace(url, '').trim().length <= 200) return { kind: 'url', url };
  return { kind: 'text', text: text.slice(0, RECIPE_TEXT_MAX) };
}

// ---------------------------------------------------------------------------
// Prompten

const EXAMPLE = {
  namn: 'Kycklinggryta',
  portioner: 4,
  ingredienser: [
    { original: 'ca 500 g kycklingfilé', mangd: 500, enhet: 'g', livsmedel: 'kycklingfilé' },
    {
      original: '1 burk krossade tomater (400 g)',
      mangd: 400,
      enhet: 'g',
      livsmedel: 'krossade tomater',
    },
    { original: '1/2 gul lök', mangd: 0.5, enhet: 'st', livsmedel: 'gul lök' },
    { original: 'salt', mangd: null, enhet: null, livsmedel: 'salt' },
  ],
  kallaUrl: 'https://example.com/kycklinggryta',
};

/** Prompten för en länk, en receptext eller en bild som bifogas i AI-tjänsten. */
export function recipeImportPrompt(input: RecipeInput): string {
  const intro =
    input.kind === 'url'
      ? 'Öppna och läs receptet på länken nedan'
      : input.kind === 'text'
        ? 'Läs receptet i texten nedan'
        : 'Jag bifogar en bild av ett recept. Läs det';
  const lines = [
    `${intro} och svara ENDAST med ett JSON-objekt – ingen annan text, ingen förklaring och inga kodblock.`,
    '',
    'Schema:',
    '{',
    '  "namn": string (receptets namn),',
    '  "portioner": tal (antal portioner receptet ger),',
    '  "ingredienser": [',
    '    {',
    '      "original": string (ingrediensraden exakt som i receptet),',
    '      "mangd": tal eller null (null om mängd saknas, t.ex. "salt efter smak"),',
    '      "enhet": string eller null (t.ex. "g", "kg", "dl", "msk", "tsk", "krm", "st", "burk", "klyfta"),',
    '      "livsmedel": string (ingrediensens namn på svenska utan mängd, t.ex. "vetemjöl", "gul lök")',
    '    }',
    '  ],',
    '  "kallaUrl": string (valfri – receptets adress)',
    '}',
    '',
    'Ta med alla ingredienser i receptets ordning, även salt och vatten. Står vikten inom parentes (t.ex. "1 burk (400 g)"), ange mängden i gram. Använd punkt som decimaltecken. Är receptet på ett annat språk: översätt livsmedlens namn till svenska men behåll originaltexten.',
  ];
  if (input.kind === 'url') {
    lines.push('', `Länk: ${input.url}`, 'Ange länken som "kallaUrl".');
  } else if (input.kind === 'text') {
    lines.push('', 'Receptet:', '"""', input.text, '"""');
  }
  lines.push('', `Exempel: ${JSON.stringify(EXAMPLE)}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Validering av svaret

export interface ImportedIngredient {
  /** Ingrediensraden som i receptet. */
  original: string;
  /** Mängd och enhet enligt AI-tjänsten (`null` = saknas). */
  amount: number | null;
  unit: string | null;
  /** Livsmedlets namn på svenska, utan mängd. */
  name: string;
}

export interface ImportedRecipe {
  name: string;
  /** `null` när svaret saknar antal portioner – fylls i före sparning. */
  servings: number | null;
  ingredients: ImportedIngredient[];
  sourceUrl?: string;
}

const FRACTIONS: Readonly<Record<string, number>> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
};

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const FRACTION_CHARS = Object.keys(FRACTIONS).join('');
/** "1 1/2", "1/2", "1½", "½", "2,5" – med valfritt intervall "2-3". */
const AMOUNT_RE = new RegExp(
  String.raw`^(?:(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|(${NUM})?\s*([${FRACTION_CHARS}])|(${NUM}))(?:\s*[-–]\s*(${NUM}))?`,
);

function decimal(text: string): number {
  return Number(text.replace(',', '.'));
}

/**
 * Mängd i början av en text: `{ value, length }` (tecken som lästes), annars `null`.
 * Ett intervall ("2-3") ger medelvärdet.
 */
export function readAmount(text: string): { value: number; length: number } | null {
  const m = AMOUNT_RE.exec(text);
  if (!m) return null;
  const [all, whole, num, den, num2, den2, lead, frac, plain, upper] = m;
  let value: number;
  if (whole !== undefined && num !== undefined && den !== undefined) {
    value = Number(whole) + Number(num) / Number(den);
  } else if (num2 !== undefined && den2 !== undefined) {
    value = Number(num2) / Number(den2);
  } else if (frac !== undefined) {
    value = (lead !== undefined ? decimal(lead) : 0) + (FRACTIONS[frac] ?? 0);
  } else if (plain !== undefined) {
    value = decimal(plain);
  } else {
    return null;
  }
  if (upper !== undefined) value = (value + decimal(upper)) / 2;
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, length: all.length };
}

/** Ett tal ≥ 0, "0,5", "1/2" eller "½" – eller `null`/`undefined` om det saknas. */
function amountValue(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return null;
    const read = readAmount(text);
    return read !== null && read.length === text.length ? read.value : undefined;
  }
  return undefined;
}

function text(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, max);
  return trimmed === '' ? null : trimmed;
}

/** Validerar AI-tjänstens svar mot schemat. Fel ger ett tydligt meddelande på svenska. */
export function parseRecipeImport(answer: string): LabelResult<ImportedRecipe> {
  const json = extractJson(answer);
  if (!json.ok) return json;
  const v = json.value;
  const missing = ['namn', 'ingredienser'].filter((k) => !(k in v));
  if (missing.length > 0) {
    return { ok: false, error: `Fält saknas i svaret: ${missing.join(', ')}.` };
  }
  const name = text(v.namn, 120);
  if (name === null) return { ok: false, error: '"namn" ska vara en text.' };
  const warnings: string[] = [];

  const servingsValue = amountValue(v.portioner);
  if (servingsValue === undefined) {
    return { ok: false, error: '"portioner" ska vara ett tal (antal portioner).' };
  }
  let servings: number | null = null;
  if (servingsValue === null || servingsValue === 0) {
    warnings.push('Antal portioner saknas i svaret – fyll i det innan du sparar.');
  } else if (servingsValue > SERVINGS_MAX) {
    return {
      ok: false,
      error: `"portioner" ska vara högst ${String(SERVINGS_MAX)}.`,
    };
  } else {
    servings = round1(servingsValue);
  }

  if (!Array.isArray(v.ingredienser)) {
    return { ok: false, error: '"ingredienser" ska vara en lista.' };
  }
  const list = v.ingredienser as unknown[];
  if (list.length === 0) return { ok: false, error: 'Receptet har inga ingredienser.' };
  if (list.length > INGREDIENTS_MAX) {
    return {
      ok: false,
      error: `Receptet har fler än ${String(INGREDIENTS_MAX)} ingredienser.`,
    };
  }
  const ingredients: ImportedIngredient[] = [];
  for (const [i, raw] of list.entries()) {
    const label = `Ingrediens ${String(i + 1)}`;
    if (!isRecord(raw)) return { ok: false, error: `${label} ska vara ett objekt.` };
    const original = text(raw.original);
    if (original === null) {
      return { ok: false, error: `${label}: "original" ska vara ingrediensraden som text.` };
    }
    const amount = amountValue(raw.mangd);
    if (amount === undefined) {
      return { ok: false, error: `${label} (${original}): "mangd" ska vara ett tal eller null.` };
    }
    if (raw.enhet !== undefined && raw.enhet !== null && typeof raw.enhet !== 'string') {
      return { ok: false, error: `${label} (${original}): "enhet" ska vara en text eller null.` };
    }
    const unit = text(raw.enhet, 20);
    // Saknas livsmedlets namn används raden utan mängd och enhet.
    const foodName = text(raw.livsmedel, 120) ?? parseIngredientText(original).name;
    ingredients.push({ original, amount: amount === 0 ? null : amount, unit, name: foodName });
  }

  const recipe: ImportedRecipe = { name, servings, ingredients };
  const url = typeof v.kallaUrl === 'string' ? v.kallaUrl.trim() : '';
  if (url !== '') {
    if (isHttpUrl(url)) recipe.sourceUrl = url;
    else warnings.push('Källan är ingen giltig webbadress och sparas inte.');
  }
  return { ok: true, value: recipe, warnings };
}

// ---------------------------------------------------------------------------
// Ingrediensrader: mängd, enhet och namn

/** Svenska enhetsord (gemener, utan punkt) → enheten som appen använder. */
const UNIT_ALIASES: Readonly<Record<string, string>> = {
  g: 'g',
  gr: 'g',
  gram: 'g',
  hg: 'hg',
  kg: 'kg',
  kilo: 'kg',
  ml: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'l',
  liter: 'l',
  msk: 'msk',
  matsked: 'msk',
  matskedar: 'msk',
  tsk: 'tsk',
  tesked: 'tsk',
  teskedar: 'tsk',
  krm: 'krm',
  kryddmått: 'krm',
  kopp: 'kopp',
  koppar: 'kopp',
  glas: 'glas',
  st: 'st',
  styck: 'st',
  stycken: 'st',
  klyfta: 'klyfta',
  klyftor: 'klyfta',
  skiva: 'skiva',
  skivor: 'skiva',
  burk: 'burk',
  burkar: 'burk',
  paket: 'förpackning',
  pkt: 'förpackning',
  förp: 'förpackning',
  förpackning: 'förpackning',
  förpackningar: 'förpackning',
  påse: 'påse',
  påsar: 'påse',
  nypa: 'nypa',
  nypor: 'nypa',
  kruka: 'kruka',
  krukor: 'kruka',
  knippe: 'knippe',
  knippen: 'knippe',
  näve: 'näve',
  nävar: 'näve',
  bit: 'bit',
  bitar: 'bit',
  portion: 'portion',
  portioner: 'portion',
};

/** Viktenheter i gram. */
const WEIGHT_G: Readonly<Record<string, number>> = { g: 1, hg: 100, kg: 1000 };

/** Förpackningar som motsvarar Open Food Facts-enheten "förpackning". */
const PACKAGES = new Set(['burk', 'förpackning', 'påse']);

/** Enhetsord → appens enhet ("matskedar" → "msk", "förp." → "förpackning"). Okänt behålls i gemener. */
export function canonicalUnit(unit: string): string {
  const key = unit.trim().toLocaleLowerCase('sv').replace(/\.$/, '');
  return UNIT_ALIASES[key] ?? key;
}

export interface IngredientQuantity {
  amount: number | null;
  /** Appens enhet ("dl", "st", "burk" …) eller `null` (antal utan enhet = styck). */
  unit: string | null;
  /** Vikten i gram när den står i texten ("500 g", "(400 g)"), annars `null`. */
  grams: number | null;
  /** "ca 500 g". */
  approx: boolean;
  /** Namnet utan mängd, enhet, parentes och tillägg efter komma. */
  name: string;
}

const APPROX_RE = /^(?:ca\.?|cirka|ungefär|runt|drygt|knappt)\s+/i;
const PAREN_WEIGHT_RE =
  /(?:(?<![a-zåäö])(à|á|a)\s*)?(?:ca\.?\s*)?(\d+(?:[.,]\d+)?)\s*(g|gram|hg|kg)(?![a-zåäö])/i;

/**
 * Tolkar en ingrediensrad: "2 dl vetemjöl" → 2 dl vetemjöl, "1 burk krossade tomater
 * (400 g)" → 1 burk, 400 g, "1/2 gul lök" → 0,5 (styck), "ca 500 g kycklingfilé" → 500 g,
 * "salt" → ingen mängd.
 */
export function parseIngredientText(line: string): IngredientQuantity {
  let rest = line.trim().replace(/\s+/g, ' ');
  let approx = false;
  const approxMatch = APPROX_RE.exec(rest);
  if (approxMatch) {
    approx = true;
    rest = rest.slice(approxMatch[0].length);
  }

  let amount: number | null = null;
  const read = readAmount(rest);
  if (read) {
    amount = read.value;
    rest = rest.slice(read.length).trim();
  }

  let unit: string | null = null;
  if (amount !== null) {
    const word = /^([a-zåäö]+)\.?(?=\s|$|\(|,)/i.exec(rest);
    const alias = word?.[1] ? UNIT_ALIASES[word[1].toLocaleLowerCase('sv')] : undefined;
    if (word && alias !== undefined) {
      unit = alias;
      rest = rest.slice(word[0].length).trim();
    }
  }

  // Vikt inom parentes: "(400 g)" = hela mängden, "(à 400 g)" = per enhet.
  let grams: number | null = null;
  for (const paren of rest.matchAll(/\(([^)]*)\)/g)) {
    const m = PAREN_WEIGHT_RE.exec(paren[1] ?? '');
    if (!m?.[2] || !m[3]) continue;
    const weight = decimal(m[2]) * (WEIGHT_G[canonicalUnit(m[3])] ?? 1);
    if (/\bca\b|cirka/i.test(paren[1] ?? '')) approx = true;
    grams = m[1] !== undefined && amount !== null ? weight * amount : weight;
    break;
  }

  const weight = unit !== null ? WEIGHT_G[unit] : undefined;
  if (weight !== undefined && amount !== null) {
    grams = amount * weight;
    amount = grams;
    unit = GRAM;
  }

  const name =
    rest
      .replace(/\([^)]*\)/g, ' ')
      .split(',')[0]
      ?.replace(/\s+/g, ' ')
      .trim() ?? '';
  return {
    amount,
    unit,
    grams: grams !== null ? round1(grams) : null,
    approx,
    name: name === '' ? line.trim() : name,
  };
}

/**
 * Mängd, enhet och vikt för en importerad ingrediens: AI-tjänstens mängd och enhet i
 * första hand, vikten inom parentes i originaltexten om enheten inte är en vikt.
 */
export function quantityOf(ingredient: ImportedIngredient): IngredientQuantity {
  const parsed = parseIngredientText(ingredient.original);
  if (ingredient.amount === null) return { ...parsed, name: ingredient.name };
  const unit = ingredient.unit !== null ? canonicalUnit(ingredient.unit) : null;
  const weight = unit !== null ? WEIGHT_G[unit] : undefined;
  if (weight !== undefined) {
    const grams = round1(ingredient.amount * weight);
    return { amount: grams, unit: GRAM, grams, approx: parsed.approx, name: ingredient.name };
  }
  return {
    amount: ingredient.amount,
    unit: unit ?? parsed.unit,
    grams: parsed.grams,
    approx: parsed.approx,
    name: ingredient.name,
  };
}

const SKIPPABLE_NAME =
  /^(?:(?:fling|havs|grov|fint?)?salt|(?:nymald |svart|vit|rosé)?peppar|(?:svart)?peppar och salt|salt och (?:svart|vit|nymald )?peppar|(?:kallt|varmt|ljummet|kokande|kokt) vatten|vatten|isbitar|is)$/;
const SKIPPABLE_TEXT = /\b(?:efter smak|till servering|till garnering|valfritt|om så önskas)\b/;

/** Salt, peppar, vatten och "efter smak" – ingredienser som kan hoppas över med ett tryck. */
export function isSkippable(ingredient: { original: string; name: string }): boolean {
  const name = ingredient.name.trim().toLocaleLowerCase('sv');
  const line = ingredient.original.toLocaleLowerCase('sv');
  return SKIPPABLE_NAME.test(name) || SKIPPABLE_TEXT.test(line) || /^salt\b/.test(line);
}

// ---------------------------------------------------------------------------
// Mängd i gram för ett valt livsmedel

export interface ResolvedAmount {
  amount: number;
  unit: string;
  grams: number;
  /** Falskt när vikten bygger på en gissning (styckvikt, volym utan densitet). */
  certain: boolean;
}

function sameUnit(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('sv') === b.trim().toLocaleLowerCase('sv');
}

function inRange(resolved: ResolvedAmount): ResolvedAmount | null {
  if (!(resolved.grams > 0) || resolved.grams > MAX_GRAMS) return null;
  // Många styck (t.ex. 150 st) sparas i gram så att receptet går att redigera.
  if (volumeMl(resolved.unit) === null && resolved.unit !== GRAM) {
    if (resolved.amount > MAX_UNIT_AMOUNT) {
      return { ...resolved, amount: resolved.grams, unit: GRAM };
    }
  }
  return resolved;
}

/**
 * Mängden i gram för livsmedlet med appens enhetssystem: gram direkt, volym via
 * densitet, styck och andra enheter ur livsmedlets enheter (standardvikt, egen enhet
 * eller gissning). `null` när mängd saknas eller enheten inte går att räkna om.
 */
export function resolveAmount(
  quantity: IngredientQuantity,
  food: FoodItem,
  custom: readonly FoodUnit[] = [],
): ResolvedAmount | null {
  if (quantity.grams !== null) {
    return inRange({ amount: quantity.grams, unit: GRAM, grams: quantity.grams, certain: true });
  }
  const { amount } = quantity;
  if (amount === null || amount <= 0) return null;
  const name = quantity.unit ?? 'st';
  const units = unitsFor(food, custom);
  const own =
    units.find((u) => sameUnit(u.name, name)) ??
    (PACKAGES.has(name) ? units.find((u) => sameUnit(u.name, 'förpackning')) : undefined);
  if (own) {
    return inRange({
      amount,
      unit: own.name,
      grams: round1(amount * own.grams),
      certain: own.source !== 'gissning',
    });
  }
  const ml = volumeMl(name);
  if (ml !== null) {
    const { density } = foodProfile(food);
    // Volym för något utan densitet ("2 dl strimlad kyckling"): 1 g/ml, att kontrollera.
    return inRange({
      amount,
      unit: name,
      grams: round1(amount * ml * (density ?? 1)),
      certain: density !== null,
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Matchning mot livsmedel

export type Confidence = 'hog' | 'osaker' | 'ingen';

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  hog: 'Säker',
  osaker: 'Osäker',
  ingen: 'Ingen träff',
};

export interface FoodMatch {
  food: FoodItem;
  confidence: 'hog' | 'osaker';
  /** Ur minnet av tidigare manuella matchningar. */
  remembered: boolean;
}

/**
 * Sökningar att prova i tur och ordning: hela namnet, sedan utan inledande ord
 * ("krossade tomater" → "tomater") och utan avslutande ord.
 */
export function candidateQueries(name: string): string[] {
  const words = normalize(name).split(' ').filter(Boolean);
  const result: string[] = [];
  const add = (parts: string[]) => {
    const q = parts.join(' ');
    if (q.length >= 3 && !result.includes(q)) result.push(q);
  };
  add(words);
  for (let i = 1; i < words.length; i++) add(words.slice(i));
  for (let i = words.length - 1; i > 0; i--) add(words.slice(0, i));
  return result;
}

/**
 * Säker träff: varje ord i sökningen finns som helt ord i livsmedlets namn, och namnet
 * har högst två ord till ("gul lök" → "Lök gul", "olivolja" → "Olivolja").
 */
export function isConfidentMatch(query: string, food: { name: string }): boolean {
  const tokens = normalize(query).split(' ').filter(Boolean);
  const words = normalize(food.name).split(' ').filter(Boolean);
  return (
    tokens.length > 0 && tokens.every((t) => words.includes(t)) && words.length <= tokens.length + 2
  );
}

/**
 * Bästa livsmedlet för en ingrediens: en tidigare manuell matchning (minnet) går först,
 * sedan fuzzy-sökning bland egna livsmedel och Livsmedelsverkets. `names` är
 * livsmedlets namn och ingrediensraden utan mängd.
 */
export function matchFood(
  names: readonly string[],
  index: readonly SearchIndexEntry<FoodItem>[],
  catalog: ReadonlyMap<string, FoodItem>,
  memory: MatchMemory,
): FoodMatch | null {
  const remembered = recallMatch(memory, names);
  const known = remembered !== null ? catalog.get(remembered) : undefined;
  if (known) return { food: known, confidence: 'hog', remembered: true };
  // Hela namnen först, sedan delar av dem.
  const queries = names.map((n) => candidateQueries(n));
  const full = queries.flatMap((q) => q.slice(0, 1));
  const parts = queries.flatMap((q) => q.slice(1));
  for (const query of [...full, ...parts]) {
    const [hit] = searchIndex(index, query, 1);
    if (hit) {
      const sure = full.includes(query) && isConfidentMatch(query, hit);
      return { food: hit, confidence: sure ? 'hog' : 'osaker', remembered: false };
    }
  }
  return null;
}

export interface ImportRow {
  ingredient: ImportedIngredient;
  quantity: IngredientQuantity;
  skippable: boolean;
  match: FoodMatch | null;
  resolved: ResolvedAmount | null;
}

/** Nycklarna i matchningsminnet för en ingrediens: livsmedlets namn och raden utan mängd. */
export function memoryNames(row: Pick<ImportRow, 'ingredient' | 'quantity'>): string[] {
  const names = [row.ingredient.name, row.quantity.name];
  return names.filter((n, i) => n.trim() !== '' && names.indexOf(n) === i);
}

/** Förslag per ingrediens: matchning och mängd i gram. */
export function buildImportRows(
  recipe: ImportedRecipe,
  context: {
    index: readonly SearchIndexEntry<FoodItem>[];
    catalog: ReadonlyMap<string, FoodItem>;
    memory: MatchMemory;
    customUnits: ReadonlyMap<string, readonly FoodUnit[]>;
  },
): ImportRow[] {
  return recipe.ingredients.map((ingredient) => {
    const quantity = quantityOf(ingredient);
    const base = { ingredient, quantity };
    const match = matchFood(memoryNames(base), context.index, context.catalog, context.memory);
    const resolved = match
      ? resolveAmount(quantity, match.food, context.customUnits.get(match.food.id))
      : null;
    return {
      ...base,
      skippable: isSkippable(ingredient) || isSkippable({ ...ingredient, name: quantity.name }),
      match,
      resolved,
    };
  });
}

/** Säkerhetsnivå: ingen träff, osäker (fuzzy träff eller osäker/saknad mängd) eller säker. */
export function confidenceOf(match: FoodMatch | null, resolved: ResolvedAmount | null): Confidence {
  if (match === null) return 'ingen';
  if (match.confidence === 'osaker' || resolved === null || !resolved.certain) return 'osaker';
  return 'hog';
}
