/** Filformatet för `public/livsmedel.json` (delas av appen och nedladdningsskriptet). */
export const LIVSMEDEL_FORMAT = 'viktresan-livsmedel';

/**
 * [nummer, namn, kcal, protein g, kolhydrater g, fett g] per 100 g, och
 * livsmedelsgruppen när den finns (styr enheterna, se foodCategories.ts).
 */
export type CompactFood =
  | [number, string, number, number, number, number]
  | [number, string, number, number, number, number, string];

export interface LivsmedelFile {
  format: typeof LIVSMEDEL_FORMAT;
  source: string;
  license: string;
  /** När datan hämtades (YYYY-MM-DD), `null` om filen är tom. */
  retrieved: string | null;
  foods: CompactFood[];
}
