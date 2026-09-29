/**
 * De inbyggda livsmedelsdatabaserna i kompakt form: Livsmedelsverkets
 * (`public/livsmedel.json`, `npm run livsmedel`) och Finelis (`public/fineli.json`,
 * `npm run fineli`). Filerna precachas av service workern och laddas ihop till en
 * lista – Livsmedelsverkets livsmedel först.
 *
 * Källor: Livsmedelsverkets livsmedelsdatabas och Fineli (THL), båda CC BY 4.0 –
 * källorna ska anges (Inställningar → Om appen).
 */
import { isNutrientKey, type ExtraNutrients, type NutrientKey } from '../data/nutrients.ts';
import type { FoodItem, FoodSource } from './foodSearch.ts';
import { LIVSMEDEL_FORMAT, type LivsmedelFile } from './livsmedelFormat.ts';

export { LIVSMEDEL_FORMAT };

export interface Livsmedel {
  source: string;
  license: string;
  retrieved: string | null;
  version?: string;
  foods: FoodItem[];
  /** De laddade databaserna (bara i `loadLivsmedel`), för källhänvisningen. */
  databases?: FoodDatabaseInfo[];
}

export type DatabaseSource = Extract<FoodSource, 'livsmedelsverket' | 'fineli'>;

export interface FoodDatabaseInfo {
  key: DatabaseSource;
  source: string;
  license: string;
  retrieved: string | null;
  version?: string;
  count: number;
}

/** Id-prefix och fil per databas. */
export const DATABASES: readonly { key: DatabaseSource; prefix: string; file: string }[] = [
  { key: 'livsmedelsverket', prefix: 'lv', file: 'livsmedel.json' },
  { key: 'fineli', prefix: 'fi', file: 'fineli.json' },
];

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** Tolkar filen. Ogiltiga rader hoppas över; fel format ger en tom lista. */
export function parseLivsmedel(
  value: unknown,
  database: DatabaseSource = 'livsmedelsverket',
): Livsmedel {
  const prefix = DATABASES.find((d) => d.key === database)?.prefix ?? 'lv';
  const empty: Livsmedel = { source: '', license: '', retrieved: null, foods: [] };
  if (typeof value !== 'object' || value === null) return empty;
  const file = value as Partial<Record<keyof LivsmedelFile, unknown>>;
  if (file.format !== LIVSMEDEL_FORMAT || !Array.isArray(file.foods)) return empty;
  // Kolumnerna i den valfria åttonde kolumnen; okända näringsämnen hoppas över.
  const extraKeys: (NutrientKey | null)[] = Array.isArray(file.extra)
    ? (file.extra as unknown[]).map((k) => (isNutrientKey(k) ? k : null))
    : [];
  const foods: FoodItem[] = [];
  for (const row of file.foods as unknown[]) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [nummer, namn, kcal, proteinG, carbsG, fatG, grupp, extras] = row as unknown[];
    if (!Number.isInteger(nummer) || typeof namn !== 'string' || namn === '') continue;
    if (!isNum(kcal) || !isNum(proteinG) || !isNum(carbsG) || !isNum(fatG)) continue;
    const food: FoodItem = {
      id: `${prefix}:${String(nummer)}`,
      name: namn,
      source: database,
      per100: { kcal, proteinG, carbsG, fatG },
    };
    if (typeof grupp === 'string' && grupp.trim() !== '') food.group = grupp.trim();
    if (Array.isArray(extras)) {
      const extra: ExtraNutrients = {};
      for (const [i, key] of extraKeys.entries()) {
        const value: unknown = extras[i];
        if (key !== null && isNum(value)) extra[key] = value;
      }
      if (Object.keys(extra).length > 0) food.extra = extra;
    }
    foods.push(food);
  }
  const result: Livsmedel = {
    source: typeof file.source === 'string' ? file.source : '',
    license: typeof file.license === 'string' ? file.license : '',
    retrieved: typeof file.retrieved === 'string' ? file.retrieved : null,
    foods,
  };
  if (typeof file.version === 'string' && file.version !== '') result.version = file.version;
  return result;
}

/**
 * Slår ihop databaserna till en lista (i ordningen i `DATABASES`). Källa, licens
 * och datum på toppnivån är den första databasens; alla finns i `databases`.
 * En databas utan livsmedel (fil saknas eller är trasig) utelämnas.
 */
export function mergeDatabases(
  parts: readonly { key: DatabaseSource; data: Livsmedel }[],
): Livsmedel {
  const loaded = parts.filter((p) => p.data.foods.length > 0);
  const first = loaded[0]?.data ?? parseLivsmedel(null);
  return {
    source: first.source,
    license: first.license,
    retrieved: first.retrieved,
    foods: loaded.flatMap((p) => p.data.foods),
    databases: loaded.map(({ key, data }) => {
      const info: FoodDatabaseInfo = {
        key,
        source: data.source,
        license: data.license,
        retrieved: data.retrieved,
        count: data.foods.length,
      };
      if (data.version !== undefined) info.version = data.version;
      return info;
    }),
  };
}

function loadFile(file: string, database: DatabaseSource): Promise<Livsmedel> {
  return fetch(`${import.meta.env.BASE_URL}${file}`)
    .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
    .then((json) => parseLivsmedel(json, database))
    .catch(() => parseLivsmedel(null));
}

let cache: Promise<Livsmedel> | null = null;

/**
 * Laddar databaserna en gång (från service workerns cache när appen är offline).
 * Blev resultatet tomt (t.ex. nätverksfel) laddas de om nästa gång.
 */
export function loadLivsmedel(): Promise<Livsmedel> {
  cache ??= Promise.all(
    DATABASES.map(async ({ key, file }) => ({ key, data: await loadFile(file, key) })),
  ).then((parts) => {
    const merged = mergeDatabases(parts);
    if (merged.foods.length === 0) cache = null;
    return merged;
  });
  return cache;
}
