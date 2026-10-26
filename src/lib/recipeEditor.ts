/**
 * Receptets redigeringsvy (`RecipeEditor`) – samma för ett importerat och ett befintligt recept:
 * en rad per ingrediens (livsmedel, mängd, enhet och om den räknas in), totaler per portion som
 * räknas om när raderna ändras och raderna som sparade ingredienser. Rena funktioner utan I/O.
 */
import type { MealIngredient } from '../db/db.ts';
import { fiberSum, scaleFiber, type FiberAmount, type FiberSource } from './fiber.ts';
import { entryUnit, sourceOf } from './foodCatalog.ts';
import type { FoodItem } from './foodSearch.ts';
import { decimalInput } from './format.ts';
import type { Nutrients } from './nutrition.ts';
import {
  confidenceOf,
  memoryNames,
  type Confidence,
  type ImportRow,
  type ResolvedAmount,
} from './recipeImport.ts';
import { recipeYield, type RecipeYield } from './recipes.ts';
import {
  GRAM,
  gramsPerUnit,
  isGram,
  mergeUnits,
  parseUnitAmount,
  round1,
  unitsFor,
  type FoodUnit,
  type Usage,
} from './units.ts';
import type { Parsed } from './validation.ts';

/** Det en ingrediensrad behöver av livsmedlet. */
export type RowFood = Pick<FoodItem, 'id' | 'name' | 'source' | 'per100' | 'per100Unit'>;

export interface EditorRow {
  key: string;
  /** Ingrediensraden som i receptet (import) – visas skrivskyddad. */
  original?: string;
  /** Vald matchning; `null` = ingen träff ännu. */
  food: RowFood | null;
  /** Livsmedlets enheter (plus den enhet raden har). */
  units: FoodUnit[];
  amount: string;
  unit: string;
  /** Falskt = "räknas inte" (salt efter smak, vatten): sparas inte i receptet. */
  counted: boolean;
  /** Importens säkerhetsnivå; `null` för rader man lagt till eller ett befintligt recept. */
  confidence: Confidence | null;
  /** Användaren har valt livsmedlet själv (sparas i matchningsminnet). */
  manual: boolean;
  /** Nycklar i matchningsminnet (importerade rader). */
  memoryNames: readonly string[];
  /** Förifylld sökning i sök-sheeten. */
  query: string;
  /** Förvald mängd i sök-sheeten när raden saknar livsmedel (det som stod i receptet). */
  suggested: Usage | null;
}

export type RowAmount = Parsed<{ amount: number; unit: string; grams: number }>;

/** Radens mängd i gram, eller felet; `null` utan livsmedel. */
export function rowAmount(row: EditorRow): RowAmount | null {
  if (row.food === null) return null;
  return parseUnitAmount(row.amount, row.unit, row.units);
}

/** Raden är klar att sparas: räknas inte, eller har livsmedel och giltig mängd. */
export function isRowReady(row: EditorRow): boolean {
  if (!row.counted) return true;
  return rowAmount(row)?.ok === true;
}

function rowFoodOf(food: FoodItem): RowFood {
  const item: RowFood = { id: food.id, name: food.name, source: food.source, per100: food.per100 };
  if (food.per100Unit === 'ml') item.per100Unit = 'ml';
  return item;
}

/** Enheterna med `unit` tillagd om den saknas (en importerad volym utan densitet, ett styck). */
function withUnit(units: FoodUnit[], unit: string, amount: number, grams: number): FoodUnit[] {
  if (isGram(unit) || gramsPerUnit(units, unit) !== null || !(amount > 0)) return units;
  return mergeUnits(units, [{ name: unit, grams: round1(grams / amount), source: 'egen' }]);
}

/** Mängden som stod i receptet: gram (vikt inom parentes), annars mängd och enhet. */
function suggestedUsage(row: ImportRow): Usage | null {
  if (row.resolved) return { unit: row.resolved.unit, amount: row.resolved.amount };
  const q = row.quantity;
  if (q.grams !== null) return { unit: GRAM, amount: q.grams };
  if (q.amount !== null) return { unit: q.unit ?? 'st', amount: q.amount };
  return null;
}

/** En rad per importerad ingrediens: förslaget, säkerheten och om den räknas in. */
export function rowsFromImport(
  rows: readonly ImportRow[],
  customUnits: ReadonlyMap<string, readonly FoodUnit[]>,
  newKey: () => string,
): EditorRow[] {
  return rows.map((row) => {
    const food = row.match?.food ?? null;
    const resolved: ResolvedAmount | null = row.resolved;
    const units = food ? unitsFor(food, customUnits.get(food.id)) : [];
    const editor: EditorRow = {
      key: newKey(),
      original: row.ingredient.original,
      food: food ? rowFoodOf(food) : null,
      units: resolved ? withUnit(units, resolved.unit, resolved.amount, resolved.grams) : units,
      amount: resolved ? decimalInput(resolved.amount) : '',
      unit: resolved?.unit ?? GRAM,
      counted: !row.skippable,
      confidence: confidenceOf(row.match, resolved),
      manual: false,
      memoryNames: memoryNames(row),
      query: row.quantity.name,
      suggested: suggestedUsage(row),
    };
    return editor;
  });
}

/** Raderna för ett befintligt recept: enheterna som de vägde när receptet sparades. */
export function rowsFromItems(
  items: readonly MealIngredient[],
  catalog: ReadonlyMap<string, FoodItem>,
  customUnits: ReadonlyMap<string, readonly FoodUnit[]>,
  newKey: () => string,
): EditorRow[] {
  return items.map((item) => {
    const known = catalog.get(item.foodId);
    const food: RowFood = {
      id: item.foodId,
      name: item.name,
      source: known?.source ?? sourceOf(item.foodId),
      per100: item.per100,
    };
    if (item.per100Unit) food.per100Unit = item.per100Unit;
    const logged = entryUnit(item);
    return {
      key: newKey(),
      food,
      units: mergeUnits(
        unitsFor(known ?? food, customUnits.get(item.foodId)),
        logged ? [logged] : [],
      ),
      amount: decimalInput(item.amount),
      unit: item.unit,
      counted: true,
      confidence: null,
      manual: false,
      memoryNames: [],
      query: item.name,
      suggested: null,
    };
  });
}

/** Raden efter ett val i sök-sheeten (nytt livsmedel, mängd och enhet). */
export function withPick(
  row: EditorRow,
  food: FoodItem,
  value: { amount: number; unit: string; grams: number },
  units: FoodUnit[],
): EditorRow {
  return {
    ...row,
    food: rowFoodOf(food),
    units: withUnit(units, value.unit, value.amount, value.grams),
    amount: decimalInput(value.amount),
    unit: value.unit,
    counted: true,
    confidence: row.confidence === null ? null : 'hog',
    manual: true,
  };
}

/** En ny rad ("Lägg till ingrediens"). */
export function newRow(
  key: string,
  food: FoodItem,
  value: { amount: number; unit: string; grams: number },
  units: FoodUnit[],
): EditorRow {
  return withPick(
    {
      key,
      food: null,
      units: [],
      amount: '',
      unit: GRAM,
      counted: true,
      confidence: null,
      manual: false,
      memoryNames: [],
      query: food.name,
      suggested: null,
    },
    food,
    value,
    units,
  );
}

/** Raderna som räknas in och har giltig mängd, som ingredienser. */
export function countedItems(rows: readonly EditorRow[]): MealIngredient[] {
  return rows.flatMap((row) => {
    const parsed = rowAmount(row);
    if (!row.counted || row.food === null || parsed?.ok !== true) return [];
    const item: MealIngredient = {
      foodId: row.food.id,
      name: row.food.name,
      ...parsed.value,
      per100: row.food.per100,
    };
    if (row.food.per100Unit === 'ml') item.per100Unit = 'ml';
    return [item];
  });
}

export interface EditorTotals {
  /** Ingredienserna som räknas (giltiga rader). */
  items: MealIngredient[];
  yield: RecipeYield;
  /** Hela receptet. */
  total: Nutrients;
  /** Per portion (`null` utan antal portioner). */
  perPortion: Nutrients | null;
  /** Fiber i hela receptet; `undefined` medan databasen laddas, `null` utan fiberdata. */
  fiber: FiberAmount | null | undefined;
  fiberPerPortion: FiberAmount | null | undefined;
}

/**
 * Totalerna som de ser ut nu: kcal, protein, kolhydrater, fett och fiber för hela receptet och
 * per portion. Rader som inte räknas, saknar livsmedel eller har ogiltig mängd är inte med.
 */
export function editorTotals(
  rows: readonly EditorRow[],
  yieldOf: { servings: number | null; cookedWeightG: number | null },
  fiberSource: FiberSource | null,
): EditorTotals {
  const items = countedItems(rows);
  const y = recipeYield({
    items,
    servings: yieldOf.servings ?? undefined,
    cookedWeightG: yieldOf.cookedWeightG ?? undefined,
  });
  const fiber = fiberSource
    ? fiberSum(
        items.map((i) => ({ foodId: i.foodId, grams: i.grams, per100: i.per100 })),
        fiberSource,
      )
    : undefined;
  return {
    items,
    yield: y,
    total: y.total,
    perPortion: y.perPortion,
    fiber,
    fiberPerPortion: y.servings !== null ? scaleFiber(fiber, 1 / y.servings) : null,
  };
}

/** Raderna att lösa före sparning: räknas in men saknar livsmedel eller giltig mängd. */
export function openRows(rows: readonly EditorRow[]): EditorRow[] {
  return rows.filter((r) => !isRowReady(r));
}

/** Manuella val att spara i matchningsminnet. */
export function rememberedMatches(
  rows: readonly EditorRow[],
): { names: readonly string[]; foodId: string }[] {
  return rows.flatMap((r) =>
    r.manual && r.food && r.memoryNames.length > 0
      ? [{ names: r.memoryNames, foodId: r.food.id }]
      : [],
  );
}

/** "5 ingredienser · 2 att granska · 1 räknas inte". */
export function rowsSummary(rows: readonly EditorRow[]): string {
  const total = rows.length;
  const parts = [`${String(total)} ${total === 1 ? 'ingrediens' : 'ingredienser'}`];
  const counted = rows.filter((r) => r.counted);
  const toCheck = counted.filter(
    (r) => !isRowReady(r) || (r.confidence !== null && r.confidence !== 'hog'),
  ).length;
  if (rows.some((r) => r.confidence !== null) || toCheck > 0) {
    parts.push(toCheck === 0 ? 'alla matchade' : `${String(toCheck)} att granska`);
  }
  const skipped = total - counted.length;
  if (skipped > 0) parts.push(`${String(skipped)} räknas inte`);
  return parts.join(' · ');
}
