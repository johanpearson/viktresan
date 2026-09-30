/**
 * Filformatet för `public/livsmedel.json` (Livsmedelsverket) och `public/fineli.json`
 * (Fineli) – delas av appen och nedladdningsskripten.
 */
import type { NutrientKey } from '../data/nutrients.ts';

export const LIVSMEDEL_FORMAT = 'viktresan-livsmedel';

/**
 * [nummer, namn, kcal, protein g, kolhydrater g, fett g] per 100 g, och
 * livsmedelsgruppen när den finns (styr enheterna, se foodCategories.ts; tom
 * sträng = ingen grupp). Den åttonde kolumnen är övriga näringsämnen per 100 g i
 * samma ordning som filens `extra` (`null` = värde saknas).
 */
export type CompactFood =
  | [number, string, number, number, number, number]
  | [number, string, number, number, number, number, string]
  | [number, string, number, number, number, number, string, (number | null)[]];

export interface LivsmedelFile {
  format: typeof LIVSMEDEL_FORMAT;
  source: string;
  license: string;
  /** När datan hämtades (YYYY-MM-DD), `null` om filen är tom. */
  retrieved: string | null;
  /** Källans version, när den har en (Fineli: "20.0"). */
  version?: string;
  /** Näringsämnena i radernas åttonde kolumn (se `src/data/nutrients.ts`). */
  extra?: NutrientKey[];
  foods: CompactFood[];
}
