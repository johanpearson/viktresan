/**
 * Näringsvärdenas status per livsmedel (kcal, protein, kolhydrater, fett, fiber, socker per
 * 100 g/ml) och egna näringsvärden (`FoodOverride`) som kompletterar eller rättar källans
 * värden. Rena funktioner utan I/O.
 *
 * Egna värden går före källans (Open Food Facts, Livsmedelsverket, Fineli) överallt där
 * livsmedlet visas eller loggas. Redan loggade poster har en kopia av kcal och makron och
 * ändras bara om användaren väljer det (`logEntriesToUpdate`); fiber och socker slås upp på
 * livsmedlet och följer därför alltid med.
 */
import type { ExtraNutrients } from '../data/nutrients.ts';
import type {
  FoodLogEntry,
  FoodOverride,
  MacroField,
  NutritionField,
  StoredFood,
} from '../db/db.ts';
import { addDays } from './dates.ts';
import type { FoodItem, FoodSource } from './foodSearch.ts';
import type { Nutrients } from './nutrition.ts';

export interface NutritionFieldInfo {
  key: NutritionField;
  label: string;
  unit: 'kcal' | 'g';
}

/** I visningsordning. */
export const NUTRITION_FIELDS: readonly NutritionFieldInfo[] = [
  { key: 'kcal', label: 'Energi', unit: 'kcal' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'carbsG', label: 'Kolhydrater', unit: 'g' },
  { key: 'fatG', label: 'Fett', unit: 'g' },
  { key: 'fiberG', label: 'Fiber', unit: 'g' },
  { key: 'sugarG', label: 'Socker', unit: 'g' },
];

const MACRO_FIELDS: readonly MacroField[] = ['kcal', 'proteinG', 'carbsG', 'fatG'];

export function isMacroField(field: NutritionField): field is MacroField {
  return (MACRO_FIELDS as readonly string[]).includes(field);
}

/** Källor vars näringsvärden kan kompletteras (egna livsmedel redigeras direkt). */
const COMPLETABLE: ReadonlySet<FoodSource> = new Set([
  'openfoodfacts',
  'livsmedelsverket',
  'fineli',
  'egen',
]);

/** Har livsmedlet egna näringsvärden per 100 g att visa status för (inte måltid, recept, snabblogg)? */
export function hasNutritionStatus(item: Pick<FoodItem, 'source'>): boolean {
  return COMPLETABLE.has(item.source);
}

/** Värdet per 100 g/ml, `null` när det saknas. */
export function nutritionValue(
  item: Pick<FoodItem, 'per100' | 'extra' | 'missing'>,
  field: NutritionField,
): number | null {
  if (field === 'fiberG' || field === 'sugarG') return item.extra?.[field] ?? null;
  if (item.missing?.includes(field)) return null;
  return item.per100[field];
}

export type ValueOrigin = 'egen' | 'kalla' | 'saknas';

export interface NutritionStatusRow extends NutritionFieldInfo {
  value: number | null;
  /** `egen` = användarens eget värde, `kalla` = livsmedlets källa, `saknas` = inget värde. */
  origin: ValueOrigin;
}

/** De sex värdena med ursprung. */
export function nutritionStatus(item: FoodItem): NutritionStatusRow[] {
  return NUTRITION_FIELDS.map((f) => {
    const value = nutritionValue(item, f.key);
    const origin: ValueOrigin =
      value === null ? 'saknas' : item.own?.includes(f.key) ? 'egen' : 'kalla';
    return { ...f, value, origin };
  });
}

/** Något av de sex värdena saknas. */
export function isIncomplete(item: FoodItem): boolean {
  return NUTRITION_FIELDS.some((f) => nutritionValue(item, f.key) === null);
}

/**
 * Livsmedlet utan egna värden: källans värden tillbaka (`base`), saknade makron åter som
 * saknade. Ett livsmedel utan egna värden lämnas som det är.
 */
export function withoutOverride(item: FoodItem): FoodItem {
  if (!item.own || item.own.length === 0) return item;
  const per100: Nutrients = { ...item.per100 };
  const extra = { ...item.extra };
  const missing = [...(item.missing ?? [])];
  for (const key of item.own) {
    const original = item.base?.[key] ?? null;
    if (isMacroField(key)) {
      per100[key] = original ?? 0;
      if (original === null) missing.push(key);
    } else if (original === null) Reflect.deleteProperty(extra, key);
    else extra[key] = original;
  }
  const next: FoodItem = { ...item, per100 };
  delete next.own;
  delete next.base;
  delete next.extra;
  delete next.missing;
  if (Object.keys(extra).length > 0) next.extra = extra;
  if (missing.length > 0) next.missing = missing;
  return next;
}

/**
 * Livsmedlet med de egna värdena ovanpå källans. `own` listar värdena som kommer från
 * användaren och `base` källans värden för dem (`null` = saknades); ett eget värde för ett
 * saknat makro tar bort det ur `missing`. Tidigare egna värden ersätts (idempotent).
 */
export function applyOverride(item: FoodItem, override: FoodOverride | undefined): FoodItem {
  const source = withoutOverride(item);
  if (!override) return source;
  const own: NutritionField[] = [];
  const base: Partial<Record<NutritionField, number | null>> = {};
  const per100: Nutrients = { ...source.per100 };
  const extra = { ...source.extra };
  for (const { key } of NUTRITION_FIELDS) {
    const value = override.values[key];
    if (value === undefined) continue;
    base[key] = nutritionValue(source, key);
    if (isMacroField(key)) per100[key] = value;
    else extra[key] = value;
    own.push(key);
  }
  if (own.length === 0) return source;
  const next: FoodItem = { ...source, per100, own, base };
  if (Object.keys(extra).length > 0) next.extra = extra;
  const missing = source.missing?.filter((f) => !own.includes(f)) ?? [];
  if (missing.length > 0) next.missing = missing;
  else delete next.missing;
  return next;
}

/** De egna värden som gäller för livsmedlet (det som ligger i `FoodOverride.values`). */
export function ownValues(item: FoodItem): FoodOverride['values'] {
  const values: FoodOverride['values'] = {};
  for (const key of item.own ?? []) {
    const value = nutritionValue(item, key);
    if (value !== null) values[key] = value;
  }
  return values;
}

/** Egna värden per livsmedels-id. */
export function overrideMap(overrides: readonly FoodOverride[]): Map<string, FoodOverride> {
  return new Map(overrides.map((o) => [o.foodId, o]));
}

/** Egna värden på en lista livsmedel (bara de som har några; övriga lämnas orörda). */
export function applyOverrides(
  items: readonly FoodItem[],
  overrides: ReadonlyMap<string, FoodOverride>,
): readonly FoodItem[] {
  if (overrides.size === 0) return items;
  return items.map((item) => applyOverride(item, overrides.get(item.id)));
}

/**
 * Egna fiber- och sockervärden i ett uppslag id → övriga näringsämnen (fiber i matloggen,
 * rapporten, övre gränsvärden). Ändrar `extras` och returnerar den.
 */
export function overlayExtras<T extends Map<string, ExtraNutrients | null | undefined>>(
  extras: T,
  overrides: readonly FoodOverride[],
): T {
  for (const o of overrides) {
    const { fiberG, sugarG } = o.values;
    if (fiberG === undefined && sugarG === undefined) continue;
    const next: ExtraNutrients = { ...extras.get(o.foodId) };
    if (fiberG !== undefined) next.fiberG = fiberG;
    if (sugarG !== undefined) next.sugarG = sugarG;
    extras.set(o.foodId, next);
  }
  return extras;
}

/** Det användaren skrev i kompletteringsformuläret: tal, eller `null` för tomt fält. */
export type EnteredValues = Partial<Record<NutritionField, number | null>>;

/**
 * Nya egna värden efter kompletteringen. Ett ifyllt värde som skiljer sig från det som
 * visades sparas som eget; samma värde som visades behåller dagens ursprung. Ett tömt fält
 * som var eget tar bort det egna värdet (källans värde gäller igen) – källans egna värden
 * går inte att ta bort.
 */
export function mergeOverride(item: FoodItem, entered: EnteredValues): FoodOverride['values'] {
  const values: FoodOverride['values'] = ownValues(item);
  for (const { key } of NUTRITION_FIELDS) {
    if (!(key in entered)) continue;
    const value = entered[key];
    const shown = nutritionValue(item, key);
    if (value === null || value === undefined) {
      Reflect.deleteProperty(values, key);
      continue;
    }
    if (shown !== null && sameValue(shown, value)) continue;
    // Samma som källans värde: inget eget värde behövs.
    const original = item.own?.includes(key) ? (item.base?.[key] ?? null) : shown;
    if (original !== null && sameValue(original, value)) Reflect.deleteProperty(values, key);
    else values[key] = value;
  }
  return values;
}

function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

/**
 * Ett eget livsmedel kompletteras direkt i livsmedlet (inga egna värden ovanpå): ifyllda
 * värden ersätter, tomma fiber/socker tas bort. Makron som lämnas tomma behåller sitt värde.
 */
export function completeStoredFood(
  food: StoredFood,
  entered: EnteredValues,
  now: number,
): StoredFood {
  const next: StoredFood = { ...food, per100: { ...food.per100 }, updatedAt: now };
  for (const { key } of NUTRITION_FIELDS) {
    if (!(key in entered)) continue;
    const value = entered[key];
    if (isMacroField(key)) {
      if (value != null) next.per100[key] = value;
      continue;
    }
    if (value == null) Reflect.deleteProperty(next, key);
    else next[key] = value;
  }
  delete next.missing;
  return next;
}

/** Vilka tidigare loggposter som uppdateras efter en komplettering. */
export type UpdateScope = 'idag' | 'vecka' | 'alla';

export const UPDATE_SCOPES: readonly { id: UpdateScope; label: string }[] = [
  { id: 'idag', label: 'Bara idag' },
  { id: 'vecka', label: 'Senaste 7 dagarna' },
  { id: 'alla', label: 'Alla' },
];

function inScope(date: string, scope: UpdateScope, today: string): boolean {
  if (scope === 'alla') return true;
  if (scope === 'idag') return date === today;
  return date >= addDays(today, -6) && date <= today;
}

function samePer100(a: Nutrients, b: Nutrients): boolean {
  return MACRO_FIELDS.every((f) => sameValue(a[f], b[f]));
}

/**
 * Loggposter av livsmedlet inom perioden vars kcal/makron skiljer sig från `per100`.
 * Snabbloggar och recept har egna värden och räknas inte. "Senaste 7 dagarna" = idag och
 * de sex dagarna före.
 */
export function logEntriesToUpdate(
  log: readonly FoodLogEntry[],
  foodId: string,
  per100: Nutrients,
  scope: UpdateScope,
  today: string,
): FoodLogEntry[] {
  return log.filter(
    (e) =>
      e.foodId === foodId &&
      !e.estimated &&
      e.recipe === undefined &&
      inScope(e.date, scope, today) &&
      !samePer100(e.per100, per100),
  );
}

/** Posterna med de nya värdena per 100 g; mängden och gram är oförändrade. */
export function updatedLogEntries(
  entries: readonly FoodLogEntry[],
  per100: Nutrients,
  now: number,
): FoodLogEntry[] {
  return entries.map((e) => ({ ...e, per100: { ...per100 }, updatedAt: now }));
}
