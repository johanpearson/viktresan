/**
 * Livsmedel från olika källor i ett gemensamt format, och fuzzy-sökning på svenska.
 */
import type { Nutrients } from './nutrition.ts';

export type FoodSource = 'livsmedelsverket' | 'egen' | 'openfoodfacts' | 'maltid';

/** Ett livsmedel att logga. Värden per 100 g; en portion är valfri. */
export interface FoodItem {
  /** Unikt över källor: `lv:<nummer>`, `egen:<uuid>`, `off:<ean>`, `maltid:<uuid>`. */
  id: string;
  name: string;
  source: FoodSource;
  per100: Nutrients;
  portionG?: number;
  portionName?: string;
  ean?: string;
}

export const SOURCE_LABELS: Record<FoodSource, string> = {
  livsmedelsverket: 'Livsmedelsverket',
  egen: 'Eget',
  openfoodfacts: 'Open Food Facts',
  maltid: 'Måltid',
};

/**
 * Normaliserar för jämförelse: gemener, å/ä → a, ö → o, övriga diakriter bort,
 * skiljetecken blir mellanslag. "Mjölk, 3 % fett" → "mjolk 3 fett".
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Damerau-Levenshtein-avstånd (optimal string alignment) med tak: returnerar
 * `max + 1` så fort avståndet säkert överstiger `max`.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, (prevPrev[j - 2] ?? 0) + 1);
      }
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  return prev[b.length] ?? max + 1;
}

/** Tillåtna stavfel för ett sökord av given längd. */
function allowedTypos(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
}

/**
 * Hur väl ett sökord matchar ett ord i namnet. Högre är bättre, 0 = ingen träff.
 * Exakt ord > början av ord > inuti ord (sammansättningar: "gryn" i "havregryn") >
 * stavfel mot ordets början.
 */
function tokenScore(token: string, word: string): number {
  if (word === token) return 100;
  if (word.startsWith(token)) return 80;
  if (token.length >= 3 && word.includes(token)) return 60;
  const typos = allowedTypos(token.length);
  if (typos === 0) return 0;
  const prefix = word.slice(0, token.length);
  const d = Math.min(
    editDistance(token, prefix, typos),
    editDistance(token, word, typos),
    // Ett tecken för mycket eller för lite i prefixet.
    editDistance(token, word.slice(0, token.length + 1), typos),
    editDistance(token, word.slice(0, Math.max(1, token.length - 1)), typos),
  );
  return d <= typos ? 50 - d * 15 : 0;
}

export interface SearchIndexEntry<T> {
  item: T;
  words: string[];
  length: number;
}

export function buildIndex<T extends { name: string }>(items: readonly T[]): SearchIndexEntry<T>[] {
  return items.map((item) => {
    const words = normalize(item.name).split(' ').filter(Boolean);
    return { item, words, length: item.name.length };
  });
}

/**
 * Söker bland livsmedel. Alla sökord måste träffa något ord i namnet.
 * Sortering: poäng, sedan träff på namnets första ord, sedan kortare namn.
 */
export function searchIndex<T>(
  index: readonly SearchIndexEntry<T>[],
  query: string,
  limit = 30,
): T[] {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  const hits: { item: T; score: number; first: boolean; length: number }[] = [];
  for (const entry of index) {
    let total = 0;
    let first = false;
    let ok = true;
    for (const [ti, token] of tokens.entries()) {
      let best = 0;
      for (const [wi, word] of entry.words.entries()) {
        const s = tokenScore(token, word);
        if (s > best) {
          best = s;
          if (ti === 0) first = wi === 0;
        }
        if (best === 100) break;
      }
      if (best === 0) {
        ok = false;
        break;
      }
      total += best;
    }
    if (ok) hits.push({ item: entry.item, score: total, first, length: entry.length });
  }
  hits.sort(
    (a, b) => b.score - a.score || Number(b.first) - Number(a.first) || a.length - b.length,
  );
  return hits.slice(0, limit).map((h) => h.item);
}

export function searchFoods<T extends { name: string }>(
  items: readonly T[],
  query: string,
  limit = 30,
): T[] {
  return searchIndex(buildIndex(items), query, limit);
}
