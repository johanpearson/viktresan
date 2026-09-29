/**
 * Livsmedel från olika källor i ett gemensamt format, och fuzzy-sökning på svenska.
 */
import type { ExtraNutrients } from '../data/nutrients.ts';
import type { LoggedRecipe } from '../db/db.ts';
import type { Nutrients } from './nutrition.ts';
import type { BaseUnit, FoodUnit } from './units.ts';

export type FoodSource =
  'livsmedelsverket' | 'fineli' | 'egen' | 'openfoodfacts' | 'maltid' | 'recept' | 'snabb';

/**
 * Ett livsmedel att logga. Värden per 100 g (eller per 100 ml, `per100Unit`).
 * `units` är livsmedlets egna enheter (portion/förpackning från Open Food Facts,
 * en måltid); kategorins enheter och användarens egna läggs till med `unitsFor`
 * (units.ts).
 */
export interface FoodItem {
  /**
   * Unikt över källor: `lv:<nummer>`, `fi:<Finelis FOODID>`, `egen:<uuid>`, `off:<ean>`, `maltid:<uuid>`,
   * `recept:<uuid>`, `snabb:<namn>:<kcal>:<protein>`.
   */
  id: string;
  name: string;
  source: FoodSource;
  per100: Nutrients;
  /** `ml` om näringsvärdena gäller per 100 ml (Open Food Facts); annars per 100 g. */
  per100Unit?: BaseUnit;
  /**
   * Livsmedelsgruppen, när den finns i datan: Livsmedelsverkets grupp (text) eller
   * Finelis användningsklass (kod, t.ex. `FRUFRESH`).
   */
  group?: string;
  /** Fiber, socker, vitaminer och mineraler per 100 g (Livsmedelsverket, Fineli), när de finns. */
  extra?: ExtraNutrients;
  units?: FoodUnit[];
  ean?: string;
  /** Recept: ingredienserna och rättens vikt, som kopieras in i loggposten. */
  recipe?: LoggedRecipe;
}

export const SOURCE_LABELS: Record<FoodSource, string> = {
  livsmedelsverket: 'Livsmedelsverket',
  fineli: 'Fineli',
  egen: 'Eget',
  openfoodfacts: 'Open Food Facts',
  maltid: 'Måltid',
  recept: 'Recept',
  snabb: 'Snabblogg',
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

/**
 * Källornas ordning vid likvärdig träff (samma poäng och samma träff på första
 * ordet): användarens egna först, sedan Livsmedelsverket, cachade Open Food
 * Facts-produkter och Fineli.
 */
export const SOURCE_RANK: Readonly<Record<FoodSource, number>> = {
  egen: 0,
  maltid: 0,
  recept: 0,
  snabb: 0,
  livsmedelsverket: 1,
  openfoodfacts: 2,
  fineli: 3,
};

/** Korta källetiketter i sökträffarna (full text i `SOURCE_LABELS`). */
export const SOURCE_TAGS: Partial<Record<FoodSource, string>> = {
  livsmedelsverket: 'LV',
  fineli: 'Fineli',
  openfoodfacts: 'OFF',
  egen: 'Egen',
};

/**
 * Källor vars träffar dedupliceras mot varandra. Användarens egna livsmedel,
 * måltider och recept döljs aldrig.
 */
const DEDUPE_SOURCES: ReadonlySet<FoodSource> = new Set([
  'livsmedelsverket',
  'fineli',
  'openfoodfacts',
]);

/** Småord som inte skiljer två livsmedel åt ("Mjölk, 3 % fett" = "Mjölk fett 3 %"). */
const FILLER_WORDS = new Set(['och', 'm', 'med', 'i', 'pa', 'av', 'typ', 'ca']);

/**
 * Nyckel för att känna igen samma livsmedel i olika källor: normaliserade ord
 * utan småord, i bokstavsordning. "Mjölk, fett 3 %" och "Mjölk 3 % fett" ger
 * samma nyckel.
 */
export function dedupeKey(name: string): string {
  return normalize(name)
    .split(' ')
    .filter((w) => w !== '' && !FILLER_WORDS.has(w))
    .sort()
    .join(' ');
}

/** Energin skiljer högst 15 % (eller 10 kcal). */
function similarEnergy(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return true;
  return Math.abs(a - b) <= Math.max(10, 0.15 * Math.max(a, b));
}

/**
 * Två träffar är samma livsmedel: samma nyckel (databaserna mäter olika, så
 * energin får skilja), eller högst ett tecken fel i en lång nyckel (stavning,
 * "yoghurt"/"yogurt") och liknande energi – så att "Ost 17 %" och "Ost 27 %"
 * inte slås ihop.
 */
export function isDuplicate(
  a: { key: string; kcal: number | null },
  b: { key: string; kcal: number | null },
): boolean {
  if (a.key === b.key) return true;
  if (Math.min(a.key.length, b.key.length) < 8 || !similarEnergy(a.kcal, b.kcal)) return false;
  return editDistance(a.key, b.key, 1) <= 1;
}

export interface SearchIndexEntry<T> {
  item: T;
  words: string[];
  length: number;
  /** Källans plats vid likvärdig träff (`SOURCE_RANK`), lägre först. */
  rank: number;
  /** Dedupliceringsnyckel, `null` = dedupliceras aldrig. */
  key: string | null;
  kcal: number | null;
}

export interface Searchable {
  name: string;
  source?: FoodSource;
  per100?: { kcal: number };
}

export function buildIndex<T extends Searchable>(items: readonly T[]): SearchIndexEntry<T>[] {
  return items.map((item) => {
    const words = normalize(item.name).split(' ').filter(Boolean);
    const source = item.source;
    return {
      item,
      words,
      length: item.name.length,
      rank: source === undefined ? 0 : SOURCE_RANK[source],
      key: source !== undefined && DEDUPE_SOURCES.has(source) ? dedupeKey(item.name) : null,
      kcal: item.per100?.kcal ?? null,
    };
  });
}

/**
 * Söker bland livsmedel från alla källor. Alla sökord måste träffa något ord i
 * namnet. Sortering: poäng, sedan hela namnet exakt, sedan träff på namnets
 * första ord, sedan källa (`SOURCE_RANK` – Livsmedelsverket före Fineli vid
 * likvärdig träff), sedan kortare namn. Samma livsmedel från flera databaser (`isDuplicate`) visas en
 * gång – från den källa som kommer först i `SOURCE_RANK`, på den bästa träffens plats.
 */
export function searchIndex<T>(
  index: readonly SearchIndexEntry<T>[],
  query: string,
  limit = 30,
): T[] {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  const whole = tokens.join(' ');
  const hits: { entry: SearchIndexEntry<T>; score: number; exact: boolean; first: boolean }[] = [];
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
    if (ok) hits.push({ entry, score: total, exact: entry.words.join(' ') === whole, first });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.exact) - Number(a.exact) ||
      Number(b.first) - Number(a.first) ||
      a.entry.rank - b.entry.rank ||
      a.entry.length - b.entry.length,
  );
  return dedupe(
    hits.map((h) => h.entry),
    limit,
  ).map((e) => e.item);
}

/** Tar bort dubbletter (se `searchIndex`) tills `limit` träffar finns. */
export function dedupe<T>(
  sorted: readonly SearchIndexEntry<T>[],
  limit: number,
): SearchIndexEntry<T>[] {
  const kept: SearchIndexEntry<T>[] = [];
  for (const entry of sorted) {
    if (kept.length >= limit) break;
    const key = entry.key;
    if (key === null) {
      kept.push(entry);
      continue;
    }
    const at = kept.findIndex(
      (k) => k.key !== null && isDuplicate({ key: k.key, kcal: k.kcal }, { key, kcal: entry.kcal }),
    );
    if (at === -1) kept.push(entry);
    else if (entry.rank < (kept[at]?.rank ?? 0)) kept[at] = entry;
  }
  return kept;
}

export function searchFoods<T extends Searchable>(
  items: readonly T[],
  query: string,
  limit = 30,
): T[] {
  return searchIndex(buildIndex(items), query, limit);
}
