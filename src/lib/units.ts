/**
 * Enheter för matloggning: gram finns alltid; ett livsmedel har dessutom de
 * enheter som passar dess kategori – volym (dl, msk …) omräknad med densitet,
 * styckenheter (st, skiva …) ur standardtabellen eller som gissning, samt
 * livsmedlets egna (Open Food Facts, måltid) och användarens egna enheter.
 * Rena funktioner utan I/O.
 */
import {
  CATEGORIES,
  CATEGORY_RULES,
  CONNECTIVES,
  FIRST_WORD_ONLY,
  GROUP_RULES,
  type FoodCategory,
} from '../data/foodCategories.ts';
import { STANDARD_UNIT_RULES, type StandardUnitRule } from '../data/units.ts';
import { normalize } from './foodSearch.ts';
import { decimalInput, formatGrams, formatMl, parseDecimal } from './format.ts';
import type { Parsed } from './validation.ts';

/**
 * Var enheten kommer ifrån. `volym` och `gissning` räknas fram vid visning och
 * lagras aldrig; en bekräftad gissning sparas som `egen`.
 */
export type UnitSource = 'standard' | 'volym' | 'openfoodfacts' | 'egen' | 'gissning';

/** En enhet för ett livsmedel, t.ex. `{ name: 'st', grams: 60 }` för ägg. */
export interface FoodUnit {
  name: string;
  /** Gram per enhet – eller ml för livsmedel med näringsvärden per 100 ml. */
  grams: number;
  source: UnitSource;
}

/** Näringsvärdena gäller per 100 g (standard) eller per 100 ml. */
export type BaseUnit = 'g' | 'ml';

/** Gram – finns för alla livsmedel och lagras som enheten `g`. */
export const GRAM = 'g';

export const UNIT_SOURCE_LABELS: Record<UnitSource, string> = {
  standard: 'Standard (ungefärlig)',
  volym: 'Volym (ungefärlig)',
  openfoodfacts: 'Open Food Facts',
  egen: 'Egen',
  gissning: 'Gissning',
};

/**
 * Fasta volymenheter i ml (svenska hushållsmått). Omräkning till gram sker med
 * livsmedlets densitet.
 */
export const VOLUME_UNITS: Readonly<Record<string, number>> = {
  ml: 1,
  krm: 1,
  tsk: 5,
  cl: 10,
  msk: 15,
  dl: 100,
  kopp: 150,
  glas: 200,
  l: 1000,
};

/** Enheter med snabbknapparna ½, 1 och 2. */
export const QUICK_AMOUNT_UNITS: readonly string[] = [
  'st',
  'skiva',
  'portion',
  'bit',
  'näve',
  'glas',
  'kopp',
  'förpackning',
];
export const QUICK_AMOUNTS: readonly { value: number; label: string }[] = [
  { value: 0.5, label: '½' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
];

/** Namnet på Open Food Facts-enheten för hela förpackningen. */
export const PACKAGE_UNIT = 'förpackning';

export const MAX_GRAMS = 5000;
export const MAX_UNIT_AMOUNT = 100;
export const UNIT_NAME_MAX = 20;

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('sv') === b.trim().toLocaleLowerCase('sv');
}

export function isGram(unit: string): boolean {
  return sameName(unit, GRAM) || sameName(unit, 'gram');
}

/** ml per enhet för en volymenhet, annars `null`. */
export function volumeMl(unit: string): number | null {
  return VOLUME_UNITS[unit.trim().toLocaleLowerCase('sv')] ?? null;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Gram för `amount` av en enhet som väger `gramsPerUnit`, avrundat till 0,1 g. */
export function toGrams(amount: number, gramsPerUnit: number): number {
  return round1(amount * gramsPerUnit);
}

/** Gram för en volym, t.ex. 2 dl mjölk med densiteten 1,03 → 206 g. `null` om enheten inte är en volym. */
export function volumeToGrams(amount: number, unit: string, density: number): number | null {
  const ml = volumeMl(unit);
  return ml === null ? null : round1(amount * ml * density);
}

/** "330 ml" eller "330 g" beroende på vad näringsvärdena gäller. */
export function formatBase(value: number, base: BaseUnit = 'g'): string {
  return base === 'ml' ? formatMl(value) : formatGrams(value);
}

/** Det som räknas i näringen: gram, eller ml om värdena gäller per 100 ml. */
export function baseOf(food: { per100Unit?: BaseUnit }): BaseUnit {
  return food.per100Unit ?? 'g';
}

export interface UnitFood {
  id: string;
  name: string;
  /** Livsmedelsverkets livsmedelsgrupp, om den finns i datan. */
  group?: string;
  per100Unit?: BaseUnit;
  units?: readonly FoodUnit[];
}

function ruleMatches(rule: StandardUnitRule, lvNumber: number | null, name: string): boolean {
  if (lvNumber !== null && rule.ids?.includes(lvNumber)) return true;
  if (!rule.pattern?.test(name)) return false;
  return !rule.exclude?.test(name);
}

/** Regel ur standardtabellen (bara livsmedel från Livsmedelsverket). */
export function standardRuleFor(
  food: { id: string; name: string },
  rules: readonly StandardUnitRule[] = STANDARD_UNIT_RULES,
): StandardUnitRule | null {
  if (!food.id.startsWith('lv:')) return null;
  const n = Number(food.id.slice(3));
  const lvNumber = Number.isInteger(n) ? n : null;
  const name = normalize(food.name);
  return rules.find((r) => ruleMatches(r, lvNumber, name)) ?? null;
}

/**
 * Kategori ur namnet (namnmönstren i foodCategories.ts), annars `null`. Namnet
 * klassas på det som står före en tillsats ("m.", "i", "u." …). Ger det ingen
 * träff provas det från andra, tredje … ordet, så att "Arla Mellanmjölk" och
 * "Mormors bulle" också hittas – utom för korta, tvetydiga ord.
 */
export function categoryFromName(name: string): FoodCategory | null {
  const all = normalize(name).split(' ');
  const cut = all.findIndex((w, i) => i > 0 && CONNECTIVES.has(w));
  const words = cut > 0 ? all.slice(0, cut) : all;
  for (let i = 0; i < words.length; i++) {
    if (i > 0 && FIRST_WORD_ONLY.has(words[i] ?? '')) continue;
    const n = words.slice(i).join(' ');
    const rule = CATEGORY_RULES.find((r) => r.pattern.test(n) && !r.exclude?.test(n));
    if (rule) return rule.category;
  }
  return null;
}

/**
 * Kategori ur Livsmedelsverkets livsmedelsgrupp. Ris/pasta m.m. är okokt om
 * inte namnet säger kokt.
 */
export function categoryFromGroup(group: string, name = ''): FoodCategory | null {
  const g = normalize(group);
  if (g === '') return null;
  const category = GROUP_RULES.find((r) => r.pattern.test(g))?.category ?? null;
  if (category === 'okokt' && /\bkokt\b/.test(normalize(name))) return 'kokt';
  return category;
}

export interface FoodProfile {
  category: FoodCategory;
  /** Gram per ml; `null` = volymenheter passar inte. 1 för värden per 100 ml. */
  density: number | null;
  /** Styckenheter ur standardtabellen. */
  standard: FoodUnit[];
}

/**
 * Livsmedlets kategori, densitet och standardenheter. Kategorin tas ur
 * standardtabellen, namnet, livsmedelsgruppen – i den ordningen – annars
 * `ovrigt`. Värden per 100 ml räknas direkt i volym (densitet 1, utan tabell).
 */
export function foodProfile(
  food: UnitFood,
  rules: readonly StandardUnitRule[] = STANDARD_UNIT_RULES,
): FoodProfile {
  if (food.id.startsWith('maltid:')) return { category: 'maltid', density: null, standard: [] };
  const rule = standardRuleFor(food, rules);
  let category =
    rule?.category ??
    categoryFromName(food.name) ??
    (food.group ? categoryFromGroup(food.group, food.name) : null) ??
    'ovrigt';
  const standard = (rule?.units ?? []).map((u) => ({ ...u, source: 'standard' as const }));
  if (food.per100Unit === 'ml') {
    // Näringsvärden per 100 ml: 1 ml = 1 "gram" i beräkningen.
    if (CATEGORIES[category].density === null || category === 'ovrigt') category = 'dryck';
    return { category, density: 1, standard };
  }
  return { category, density: rule?.density ?? CATEGORIES[category].density, standard };
}

/**
 * Enheterna som passar livsmedlet, utan användarens egna: livsmedlets egna
 * (Open Food Facts, måltid) först, sedan kategorins enheter i ordning (standard-
 * vikt, volym via densitet eller gissning) och övriga standardenheter.
 */
export function builtInUnits(
  food: UnitFood,
  rules: readonly StandardUnitRule[] = STANDARD_UNIT_RULES,
): FoodUnit[] {
  const own = mergeUnits(food.units);
  const { category, density, standard } = foodProfile(food, rules);
  const info = CATEGORIES[category];
  const result: FoodUnit[] = [...own];
  const has = (name: string) => result.some((u) => sameName(u.name, name));
  for (const name of info.units) {
    if (has(name)) continue;
    const std = standard.find((u) => sameName(u.name, name));
    const ml = volumeMl(name);
    const guess = info.pieces[name];
    if (std) result.push(std);
    else if (ml !== null && density !== null) {
      result.push({ name, grams: round1(ml * density), source: 'volym' });
    } else if (guess !== undefined) result.push({ name, grams: guess, source: 'gissning' });
  }
  for (const std of standard) if (!has(std.name)) result.push(std);
  return result;
}

/**
 * Slår ihop listor av enheter. En senare lista vinner vid samma namn (skiftläge
 * ignoreras) men behåller platsen; gram tas bort (det finns alltid).
 */
export function mergeUnits(...lists: readonly (readonly FoodUnit[] | undefined)[]): FoodUnit[] {
  const result: FoodUnit[] = [];
  for (const list of lists) {
    for (const unit of list ?? []) {
      if (isGram(unit.name)) continue;
      const i = result.findIndex((u) => sameName(u.name, unit.name));
      if (i >= 0) result[i] = unit;
      else result.push(unit);
    }
  }
  return result;
}

/**
 * Alla enheter för ett livsmedel: de som passar (se `builtInUnits`) och
 * användarens egna, som vinner vid samma namn.
 */
export function unitsFor(food: UnitFood, custom: readonly FoodUnit[] = []): FoodUnit[] {
  return mergeUnits(builtInUnits(food), custom);
}

export function isGuess(unit: FoodUnit | undefined): boolean {
  return unit?.source === 'gissning';
}

/**
 * Bekräftar en gissad (eller justerad) enhet: den sparas bland användarens egna
 * enheter och ersätter en tidigare med samma namn.
 */
export function confirmGuess(
  custom: readonly FoodUnit[],
  unit: FoodUnit,
  grams: number = unit.grams,
): FoodUnit[] {
  return mergeUnits(custom, [{ name: unit.name, grams: round1(grams), source: 'egen' }]);
}

/** Frågan som visas för en gissad enhet. */
export function guessQuestion(unit: FoodUnit, base: BaseUnit = 'g'): string {
  return `1 ${unit.name} ≈ ${formatBase(unit.grams, base)}, stämmer det?`;
}

/** Gram per enhet; 1 för gram, `null` om enheten saknas. */
export function gramsPerUnit(units: readonly FoodUnit[], unit: string): number | null {
  if (isGram(unit)) return 1;
  return units.find((u) => sameName(u.name, unit))?.grams ?? null;
}

/** "2 st" / "120 g". */
export function amountLabel(amount: number, unit: string): string {
  return isGram(unit) ? formatGrams(amount) : `${decimalInput(amount)} ${unit}`;
}

/** "2 st (120 g)" för loggade poster, "33 cl (330 ml)" per 100 ml, "120 g" för gram. */
export function loggedAmountText(entry: {
  amount: number;
  unit: string;
  grams: number;
  per100Unit?: BaseUnit;
}): string {
  if (isGram(entry.unit)) return formatGrams(entry.grams);
  return `${amountLabel(entry.amount, entry.unit)} (${formatBase(entry.grams, baseOf(entry))})`;
}

export interface Usage {
  unit: string;
  amount: number;
}

/** Senast använda enhet och mängd för ett livsmedel (ur matloggen), eller null. */
export function lastUsage(
  log: readonly {
    foodId: string;
    unit: string;
    amount: number;
    createdAt: number;
    updatedAt?: number;
  }[],
  foodId: string,
): Usage | null {
  let best: (typeof log)[number] | null = null;
  for (const e of log) {
    if (e.foodId !== foodId) continue;
    if (!best || (e.updatedAt ?? e.createdAt) >= (best.updatedAt ?? best.createdAt)) best = e;
  }
  return best ? { unit: best.unit, amount: best.amount } : null;
}

/**
 * Förvald enhet och mängd: senast använda om enheten finns kvar, annars 1 av
 * första enheten med känd vikt (livsmedlets egen, standard eller användarens) –
 * annars kategorins vanligaste (`units` är ordnad efter kategorin), annars 100 g.
 */
export function initialUsage(units: readonly FoodUnit[], last: Usage | null): Usage {
  if (last && gramsPerUnit(units, last.unit) !== null) {
    return { unit: isGram(last.unit) ? GRAM : last.unit, amount: last.amount };
  }
  const known = units.find((u) => u.source !== 'volym' && u.source !== 'gissning');
  const first = known ?? units[0];
  return first ? { unit: first.name, amount: 1 } : { unit: GRAM, amount: 100 };
}

/**
 * Mängd i en enhet → gram. Gram: 0–5 000; volym: högst 5 000 g; andra enheter:
 * 0–100 st och högst 5 000 g.
 */
export function parseUnitAmount(
  text: string,
  unit: string,
  units: readonly FoodUnit[],
): Parsed<{ amount: number; unit: string; grams: number }> {
  const per = gramsPerUnit(units, unit);
  if (per === null) return { ok: false, error: 'Välj en enhet.' };
  const amount = parseDecimal(text);
  if (isGram(unit)) {
    if (amount == null || amount <= 0 || amount > MAX_GRAMS) {
      return { ok: false, error: 'Ange mängd i gram (1–5 000).' };
    }
    return { ok: true, value: { amount, unit: GRAM, grams: round1(amount) } };
  }
  const grams = amount == null ? 0 : toGrams(amount, per);
  const maxAmount = volumeMl(unit) === null ? MAX_UNIT_AMOUNT : MAX_GRAMS;
  if (amount == null || amount <= 0 || amount > maxAmount || grams > MAX_GRAMS) {
    return { ok: false, error: `Ange antal ${unit} (mer än 0, högst 5 000 g).` };
  }
  return { ok: true, value: { amount, unit, grams } };
}

/**
 * Ny eller ändrad egen enhet. Namnet får inte vara gram eller krocka med en
 * annan egen enhet (`others`); samma namn som en standardenhet ersätter den.
 */
export function parseCustomUnit(
  name: string,
  gramsText: string,
  others: readonly FoodUnit[],
): Parsed<FoodUnit> {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > UNIT_NAME_MAX) {
    return { ok: false, error: `Ge enheten ett namn (högst ${String(UNIT_NAME_MAX)} tecken).` };
  }
  if (isGram(trimmed)) return { ok: false, error: 'Gram finns redan som enhet.' };
  if (others.some((u) => sameName(u.name, trimmed))) {
    return { ok: false, error: `Enheten ${trimmed} finns redan.` };
  }
  const grams = parseDecimal(gramsText);
  if (grams == null || grams < 0.1 || grams > MAX_GRAMS) {
    return { ok: false, error: 'Ange vikten i gram (0,1–5 000).' };
  }
  return { ok: true, value: { name: trimmed, grams: round1(grams), source: 'egen' } };
}

function positive(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const n = parseDecimal(value);
    if (n != null && n > 0) return n;
  }
  return null;
}

const WEIGHT_RE = /(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gram)(?![a-zåäö])/gi;
const VOLUME_RE = /(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|liter)(?![a-zåäö])/gi;
const TO_BASE: Readonly<Record<string, number>> = {
  kg: 1000,
  g: 1,
  gr: 1,
  gram: 1,
  ml: 1,
  cl: 10,
  dl: 100,
  l: 1000,
  liter: 1000,
};

/**
 * Mängd i basenheten ur en text: gram ur "30 g", "1 portion (30 g)", "0,25 kg";
 * ml ur "33 cl", "1,5 l". Sista angivelsen vinner: "1 skiva (25 g)" → 25.
 */
function amountFromText(text: string, base: BaseUnit): number | null {
  const re = base === 'ml' ? VOLUME_RE : WEIGHT_RE;
  let result: number | null = null;
  for (const m of text.matchAll(re)) {
    const n = parseDecimal(m[1] ?? '');
    const factor = TO_BASE[(m[2] ?? '').toLowerCase()];
    if (n == null || n <= 0 || factor === undefined) continue;
    result = n * factor;
  }
  return result;
}

function unitIsBase(unit: string, base: BaseUnit): boolean {
  const u = unit.trim().toLowerCase();
  return base === 'ml' ? u === 'ml' : isGram(u);
}

/**
 * Portionsstorlek ur Open Food Facts `serving_size` (fritext, t.ex. "1 portion
 * (30 g)") och `serving_quantity` (+ `serving_quantity_unit`), i basenheten:
 * gram, eller ml när näringsvärdena gäller per 100 ml. Andra enheter räknas
 * inte om. `null` om det inte går.
 */
export function parseServing(
  servingSize: unknown,
  servingQuantity: unknown,
  servingQuantityUnit?: unknown,
  base: BaseUnit = 'g',
): number | null {
  let value: number | null = null;
  const text = typeof servingSize === 'string' ? servingSize.trim() : '';
  if (text !== '') value = amountFromText(text, base);
  if (value === null) {
    const unit = typeof servingQuantityUnit === 'string' ? servingQuantityUnit.trim() : '';
    const other = base === 'ml' ? 'g' : 'ml';
    const otherText = text !== '' && amountFromText(text, other) !== null;
    const unitOk = unit === '' ? !otherText : unitIsBase(unit, base);
    if (unitOk) value = positive(servingQuantity);
  }
  if (value === null || value <= 0 || value > MAX_GRAMS) return null;
  return round1(value);
}

/**
 * Hela förpackningen ur Open Food Facts `product_quantity` +
 * `product_quantity_unit` (reserv: fritexten `quantity`, t.ex. "33 cl"), i
 * basenheten. Står förpackningen i den andra enheten (ml mot per 100 g eller
 * tvärtom) räknas den om med densiteten 1,0 g/ml – ungefärligt, men nära för
 * drycker och flytande mejeri. `null` om det inte går eller är över 5 000.
 */
export function parsePackage(
  productQuantity: unknown,
  productQuantityUnit: unknown,
  quantityText: unknown,
  base: BaseUnit = 'g',
): number | null {
  let value: number | null = null;
  const qty = positive(productQuantity);
  const unit =
    typeof productQuantityUnit === 'string' ? productQuantityUnit.trim().toLowerCase() : '';
  const factor = unit === '' ? 1 : TO_BASE[unit];
  if (qty !== null && factor !== undefined) value = qty * factor;
  if (value === null && typeof quantityText === 'string') {
    value =
      amountFromText(quantityText, base) ??
      amountFromText(quantityText, base === 'ml' ? 'g' : 'ml');
  }
  if (value === null || value <= 0 || value > MAX_GRAMS) return null;
  return round1(value);
}
