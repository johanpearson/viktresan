/**
 * Livsmedelsverkets livsmedelsdatabas i kompakt form (`public/livsmedel.json`).
 * Filen genereras av `npm run livsmedel` och precachas av service workern.
 *
 * Källa: Livsmedelsverkets livsmedelsdatabas, licens CC BY 4.0 – källan ska anges.
 */
import type { FoodItem } from './foodSearch.ts';
import { LIVSMEDEL_FORMAT, type LivsmedelFile } from './livsmedelFormat.ts';

export { LIVSMEDEL_FORMAT };

export interface Livsmedel {
  source: string;
  license: string;
  retrieved: string | null;
  foods: FoodItem[];
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** Tolkar filen. Ogiltiga rader hoppas över; fel format ger en tom lista. */
export function parseLivsmedel(value: unknown): Livsmedel {
  const empty: Livsmedel = { source: '', license: '', retrieved: null, foods: [] };
  if (typeof value !== 'object' || value === null) return empty;
  const file = value as Partial<Record<keyof LivsmedelFile, unknown>>;
  if (file.format !== LIVSMEDEL_FORMAT || !Array.isArray(file.foods)) return empty;
  const foods: FoodItem[] = [];
  for (const row of file.foods as unknown[]) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [nummer, namn, kcal, proteinG, carbsG, fatG] = row as unknown[];
    if (!Number.isInteger(nummer) || typeof namn !== 'string' || namn === '') continue;
    if (!isNum(kcal) || !isNum(proteinG) || !isNum(carbsG) || !isNum(fatG)) continue;
    foods.push({
      id: `lv:${String(nummer)}`,
      name: namn,
      source: 'livsmedelsverket',
      per100: { kcal, proteinG, carbsG, fatG },
    });
  }
  return {
    source: typeof file.source === 'string' ? file.source : '',
    license: typeof file.license === 'string' ? file.license : '',
    retrieved: typeof file.retrieved === 'string' ? file.retrieved : null,
    foods,
  };
}

let cache: Promise<Livsmedel> | null = null;

/** Laddar databasen en gång (från service workerns cache när appen är offline). */
export function loadLivsmedel(): Promise<Livsmedel> {
  cache ??= fetch(`${import.meta.env.BASE_URL}livsmedel.json`)
    .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
    .then(parseLivsmedel)
    .catch(() => {
      cache = null;
      return parseLivsmedel(null);
    });
  return cache;
}
