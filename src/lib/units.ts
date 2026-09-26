/**
 * Enheter för matloggning: gram är alltid tillgängligt; ett livsmedel kan dessutom
 * ha st, skiva, dl, portion … med ett ungefärligt antal gram per enhet.
 * Rena funktioner utan I/O.
 */
import { STANDARD_UNIT_RULES, type StandardUnitRule } from '../data/units.ts';
import { normalize } from './foodSearch.ts';
import { decimalInput, formatGrams, parseDecimal } from './format.ts';
import type { Parsed } from './validation.ts';

export type UnitSource = 'standard' | 'openfoodfacts' | 'egen';

/** En enhet för ett livsmedel, t.ex. `{ name: 'st', grams: 60 }` för ägg. */
export interface FoodUnit {
  name: string;
  grams: number;
  source: UnitSource;
}

/** Gram – finns för alla livsmedel och lagras som enheten `g`. */
export const GRAM = 'g';

export const UNIT_SOURCE_LABELS: Record<UnitSource, string> = {
  standard: 'Standard (ungefärlig)',
  openfoodfacts: 'Open Food Facts',
  egen: 'Egen',
};

/** Enheter med snabbknapparna ½, 1 och 2. */
export const QUICK_AMOUNT_UNITS: readonly string[] = ['st', 'skiva', 'portion'];
export const QUICK_AMOUNTS: readonly { value: number; label: string }[] = [
  { value: 0.5, label: '½' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
];

export const MAX_GRAMS = 5000;
export const MAX_UNIT_AMOUNT = 100;
export const UNIT_NAME_MAX = 20;

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('sv') === b.trim().toLocaleLowerCase('sv');
}

export function isGram(unit: string): boolean {
  return sameName(unit, GRAM) || sameName(unit, 'gram');
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Gram för `amount` av en enhet som väger `gramsPerUnit`, avrundat till 0,1 g. */
export function toGrams(amount: number, gramsPerUnit: number): number {
  return round1(amount * gramsPerUnit);
}

function ruleMatches(rule: StandardUnitRule, lvNumber: number | null, name: string): boolean {
  if (lvNumber !== null && rule.ids?.includes(lvNumber)) return true;
  if (!rule.pattern?.test(name)) return false;
  return !rule.exclude?.test(name);
}

/**
 * Standardenheter ur den kuraterade tabellen (`src/data/units.ts`). Gäller bara
 * livsmedel från Livsmedelsverket; matchning på nummer eller namnmönster.
 */
export function standardUnitsFor(
  food: { id: string; name: string },
  rules: readonly StandardUnitRule[] = STANDARD_UNIT_RULES,
): FoodUnit[] {
  if (!food.id.startsWith('lv:')) return [];
  const n = Number(food.id.slice(3));
  const lvNumber = Number.isInteger(n) ? n : null;
  const name = normalize(food.name);
  const rule = rules.find((r) => ruleMatches(r, lvNumber, name));
  return rule ? rule.units.map((u) => ({ ...u, source: 'standard' })) : [];
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
 * Alla enheter för ett livsmedel: livsmedlets egna (portion från Open Food Facts
 * eller en måltid), standardtabellen och användarens egna enheter (vinner vid
 * samma namn).
 */
export function unitsFor(
  food: { id: string; name: string; units?: readonly FoodUnit[] },
  custom: readonly FoodUnit[] = [],
): FoodUnit[] {
  return mergeUnits(food.units, standardUnitsFor(food), custom);
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

/** "2 st (120 g)" för loggade poster, "120 g" för gram. */
export function loggedAmountText(entry: { amount: number; unit: string; grams: number }): string {
  if (isGram(entry.unit)) return formatGrams(entry.grams);
  return `${amountLabel(entry.amount, entry.unit)} (${formatGrams(entry.grams)})`;
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
 * livsmedlets första enhet, annars 100 g.
 */
export function initialUsage(units: readonly FoodUnit[], last: Usage | null): Usage {
  if (last && gramsPerUnit(units, last.unit) !== null) {
    return { unit: isGram(last.unit) ? GRAM : last.unit, amount: last.amount };
  }
  const first = units[0];
  return first ? { unit: first.name, amount: 1 } : { unit: GRAM, amount: 100 };
}

/** Mängd i en enhet → gram. Gram: 0–5 000; andra enheter: 0–100 st och högst 5 000 g. */
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
  if (amount == null || amount <= 0 || amount > MAX_UNIT_AMOUNT || grams > MAX_GRAMS) {
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

/** Gram ur en text som "30 g", "1 portion (30 g)", "0,25 kg". `null` för ml o.d. */
function gramsFromText(text: string): number | null {
  const re = /(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gram)(?![a-zåäö])/gi;
  let result: number | null = null;
  for (const m of text.matchAll(re)) {
    const n = parseDecimal(m[1] ?? '');
    if (n == null || n <= 0) continue;
    // Sista gramangivelsen vinner: "1 skiva (25 g)" → 25.
    result = (m[2] ?? '').toLowerCase() === 'kg' ? n * 1000 : n;
  }
  return result;
}

/**
 * Portionsstorlek i gram ur Open Food Facts `serving_size` (fritext, t.ex.
 * "1 portion (30 g)") och `serving_quantity` (+ `serving_quantity_unit`).
 * Endast vikt i gram godtas – volym (ml) räknas inte om. `null` om det inte går.
 */
export function parseServing(
  servingSize: unknown,
  servingQuantity: unknown,
  servingQuantityUnit?: unknown,
): number | null {
  let grams: number | null = null;
  const text = typeof servingSize === 'string' ? servingSize.trim() : '';
  if (text !== '') grams = gramsFromText(text);
  if (grams === null) {
    const unit = typeof servingQuantityUnit === 'string' ? servingQuantityUnit.trim() : '';
    const volumeText = text !== '' && /\d\s*(ml|cl|dl|l)(?![a-zåäö])/i.test(text);
    const unitOk = unit === '' ? !volumeText : isGram(unit);
    if (unitOk) grams = positive(servingQuantity);
  }
  if (grams === null || grams <= 0 || grams > MAX_GRAMS) return null;
  return round1(grams);
}
