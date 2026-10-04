/**
 * Mindre brus i matsökningen: dolda livsmedel, dolda kategorier och avstängda källor.
 * Påverkar bara vad som visas i sökning och snabbval – aldrig loggen, historiken,
 * rapporten eller summeringar (som läser loggposternas egna kopior och hela katalogen).
 */
import { CATEGORIES, type FoodCategory } from '../data/foodCategories.ts';
import { hiddenKey, type FoodLogEntry, type HiddenFood } from '../db/db.ts';
import type { FoodItem, FoodSource } from './foodSearch.ts';
import { foodProfile } from './units.ts';

/** Databaskällorna som kan stängas av. Egna livsmedel, måltider och recept visas alltid. */
export const DATABASE_SOURCES = ['livsmedelsverket', 'fineli', 'openfoodfacts'] as const;
export type DatabaseSource = (typeof DATABASE_SOURCES)[number];

/** Kategorier som inte går att dölja (måltider och recept är användarens egna). */
const UNHIDEABLE: ReadonlySet<FoodCategory> = new Set(['maltid']);

/** Kategorierna som kan döljas, i tabellens ordning. */
export const HIDEABLE_CATEGORIES: readonly FoodCategory[] = (
  Object.keys(CATEGORIES) as FoodCategory[]
).filter((c) => !UNHIDEABLE.has(c));

export interface FoodFilters {
  /** Dolda livsmedel (alla källor, även egna snabbval). */
  ids: ReadonlySet<string>;
  /** Dolda kategorier – gäller bara databaskällorna. */
  categories: ReadonlySet<FoodCategory>;
  /** Avstängda databaskällor. */
  sources: ReadonlySet<DatabaseSource>;
}

export const NO_FILTERS: FoodFilters = {
  ids: new Set(),
  categories: new Set(),
  sources: new Set(),
};

export function isDatabaseSource(source: FoodSource): source is DatabaseSource {
  return (DATABASE_SOURCES as readonly string[]).includes(source);
}

function isCategory(value: string): value is FoodCategory {
  return value in CATEGORIES;
}

/** Filtren ur databasens poster (okända värden hoppas över). */
export function filtersFrom(hidden: readonly HiddenFood[]): FoodFilters {
  if (hidden.length === 0) return NO_FILTERS;
  const ids = new Set<string>();
  const categories = new Set<FoodCategory>();
  const sources = new Set<DatabaseSource>();
  for (const h of hidden) {
    if (h.kind === 'livsmedel') ids.add(h.value);
    else if (h.kind === 'kategori' && isCategory(h.value)) categories.add(h.value);
    else if (h.kind === 'kalla' && isDatabaseSource(h.value as FoodSource)) {
      sources.add(h.value as DatabaseSource);
    }
  }
  return { ids, categories, sources };
}

export function hasFilters(filters: FoodFilters): boolean {
  return filters.ids.size > 0 || filters.categories.size > 0 || filters.sources.size > 0;
}

/** Kategorin räknas en gång per livsmedel (samma objekt) – den är dyr för hela databasen. */
const categoryCache = new WeakMap<object, FoodCategory>();

/** Livsmedlets kategori (`foodProfile`), cachad per objekt. */
export function categoryOf(item: Pick<FoodItem, 'id' | 'name' | 'group' | 'per100Unit'>) {
  const cached = categoryCache.get(item);
  if (cached !== undefined) return cached;
  const category = foodProfile(item).category;
  categoryCache.set(item, category);
  return category;
}

/**
 * Om livsmedlet ska visas i sökning och snabbval: inte dolt, och för databaskällorna dessutom
 * påslagen källa och synlig kategori. Egna livsmedel, måltider och recept döljs bara ett och ett.
 */
export function isVisible(
  item: FoodItem,
  filters: FoodFilters,
  category: (item: FoodItem) => FoodCategory = categoryOf,
): boolean {
  if (filters.ids.has(item.id)) return false;
  if (!isDatabaseSource(item.source)) return true;
  if (filters.sources.has(item.source)) return false;
  return filters.categories.size === 0 || !filters.categories.has(category(item));
}

/** Livsmedlen som ska visas (samma lista om inget är dolt). */
export function visibleFoods<T extends FoodItem>(
  items: readonly T[],
  filters: FoodFilters,
  category?: (item: FoodItem) => FoodCategory,
): readonly T[] {
  if (!hasFilters(filters)) return items;
  return items.filter((item) => isVisible(item, filters, category));
}

/** En post att spara när ett livsmedel döljs (svep eller långtryck i sök-sheeten). */
export function hiddenFoodEntry(item: Pick<FoodItem, 'id' | 'name'>, now = Date.now()): HiddenFood {
  return {
    key: hiddenKey('livsmedel', item.id),
    kind: 'livsmedel',
    value: item.id,
    name: item.name.slice(0, 200),
    createdAt: now,
  };
}

export function hiddenCategoryEntry(category: FoodCategory, now = Date.now()): HiddenFood {
  return {
    key: hiddenKey('kategori', category),
    kind: 'kategori',
    value: category,
    createdAt: now,
  };
}

export function hiddenSourceEntry(source: DatabaseSource, now = Date.now()): HiddenFood {
  return { key: hiddenKey('kalla', source), kind: 'kalla', value: source, createdAt: now };
}

export interface CategoryCount {
  category: FoodCategory;
  label: string;
  /** Antal livsmedel i databaskällorna med kategorin. */
  foods: number;
  /** Antal loggposter (alla tider) med kategorin. */
  logged: number;
}

/**
 * Kategorierna i Livsmedelsverkets, Finelis och cachade Open Food Facts-livsmedel (mappade till
 * appens kategorier) med antal livsmedel och loggposter. Bara kategorier som finns i datan.
 */
export function categoryCounts(
  foods: readonly FoodItem[],
  log: readonly Pick<FoodLogEntry, 'foodId' | 'name' | 'per100Unit'>[],
  catalog: ReadonlyMap<string, FoodItem> = new Map(),
  category: (
    item: Pick<FoodItem, 'id' | 'name' | 'group' | 'per100Unit'>,
  ) => FoodCategory = categoryOf,
): CategoryCount[] {
  const counts = new Map<FoodCategory, { foods: number; logged: number }>();
  const at = (c: FoodCategory) => {
    let entry = counts.get(c);
    if (!entry) {
      entry = { foods: 0, logged: 0 };
      counts.set(c, entry);
    }
    return entry;
  };
  for (const item of foods) {
    if (!isDatabaseSource(item.source)) continue;
    const c = category(item);
    if (!UNHIDEABLE.has(c)) at(c).foods += 1;
  }
  for (const e of log) {
    if (/^(maltid|recept|snabb|egen):/.test(e.foodId)) continue;
    // Livsmedlet ur katalogen (med grupp) när det finns, annars namnet i posten.
    const item = catalog.get(e.foodId) ?? {
      id: e.foodId,
      name: e.name,
      ...(e.per100Unit ? { per100Unit: e.per100Unit } : {}),
    };
    const c = category(item);
    if (counts.has(c)) at(c).logged += 1;
  }
  return HIDEABLE_CATEGORIES.filter((c) => counts.has(c)).map((c) => {
    const { foods: n, logged } = counts.get(c) ?? { foods: 0, logged: 0 };
    return { category: c, label: CATEGORIES[c].label, foods: n, logged };
  });
}

/** Högst så här många kategorier föreslås. */
export const SUGGESTION_LIMIT = 5;

/**
 * Förslag på kategorier att dölja: aldrig loggade (och inte redan dolda), flest livsmedel först.
 * Övrigt föreslås inte – den rymmer allt som inte känns igen.
 */
export function suggestedCategories(
  counts: readonly CategoryCount[],
  hidden: ReadonlySet<FoodCategory>,
  limit = SUGGESTION_LIMIT,
): CategoryCount[] {
  return counts
    .filter(
      (c) => c.logged === 0 && c.foods > 0 && c.category !== 'ovrigt' && !hidden.has(c.category),
    )
    .sort((a, b) => b.foods - a.foods || a.label.localeCompare(b.label, 'sv'))
    .slice(0, limit);
}
