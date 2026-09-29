/**
 * Minnet av manuella matchningar i receptimporten: ingredienstext (normaliserad) →
 * livsmedels-id. Nästa import med samma ingrediens föreslår samma livsmedel. Lagras i
 * `settings` (enheten, som övriga inställningar) – ingen schemaändring.
 */
import { SETTING_INGREDIENT_MATCHES, getSetting, setSetting } from '../db/db.ts';
import { normalize } from './foodSearch.ts';

/** Nyckel (normaliserad ingredienstext) → livsmedels-id. Senast sparade sist. */
export type MatchMemory = Readonly<Record<string, string>>;

/** Så många matchningar sparas; de äldsta försvinner först. */
export const MATCH_MEMORY_MAX = 500;

export const EMPTY_MEMORY: MatchMemory = {};

/** "Krossade tomater (400 g)" och "krossade  tomater" ger samma nyckel. */
export function memoryKey(text: string): string {
  return normalize(text.replace(/\([^)]*\)/g, ' '));
}

/** Livsmedels-id för första namnet som finns i minnet, annars `null`. */
export function recallMatch(memory: MatchMemory, names: readonly string[]): string | null {
  for (const name of names) {
    const key = memoryKey(name);
    const id = key !== '' ? memory[key] : undefined;
    if (id !== undefined) return id;
  }
  return null;
}

/**
 * Kommer ihåg att namnen matchar livsmedlet. En tidigare matchning för samma text
 * ersätts och flyttas sist; blir minnet för stort tas de äldsta bort.
 */
export function rememberMatch(
  memory: MatchMemory,
  names: readonly string[],
  foodId: string,
): MatchMemory {
  const keys = names.map(memoryKey).filter((k) => k !== '');
  const entries = Object.entries(memory).filter(([k]) => !keys.includes(k));
  for (const key of new Set(keys)) entries.push([key, foodId]);
  return Object.fromEntries(entries.slice(-MATCH_MEMORY_MAX));
}

/** Tolkar det lagrade värdet; ogiltiga poster hoppas över. */
export function parseMatchMemory(value: unknown): MatchMemory {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return EMPTY_MEMORY;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (e): e is [string, string] => typeof e[1] === 'string' && e[0] !== '' && e[1] !== '',
  );
  return Object.fromEntries(entries.slice(-MATCH_MEMORY_MAX));
}

export async function loadMatchMemory(): Promise<MatchMemory> {
  return parseMatchMemory(await getSetting(SETTING_INGREDIENT_MATCHES));
}

/** Sparar nya matchningar ovanpå det som finns lagrat (läser om först). */
export async function saveMatches(
  matches: readonly { names: readonly string[]; foodId: string }[],
): Promise<void> {
  if (matches.length === 0) return;
  let memory = await loadMatchMemory();
  for (const m of matches) memory = rememberMatch(memory, m.names, m.foodId);
  await setSetting(SETTING_INGREDIENT_MATCHES, memory);
}
