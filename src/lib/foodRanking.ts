/**
 * Rankning av sökträffar: egna och nyligen loggade först (frekvens och hur nyligen), och högst
 * tre träffar per närliggande variant ("Bröd fullkorn …") innan "Visa fler varianter".
 * Rena funktioner.
 */
import type { FoodLogEntry } from '../db/db.ts';
import { daysBetween } from './dates.ts';
import { FILLER_WORDS, normalize, type FoodItem } from './foodSearch.ts';

/** Halveringstid (dagar) för en loggpost i användningspoängen. */
export const USAGE_HALF_LIFE_DAYS = 30;
/** Så många träffar per variant visas innan "Visa fler varianter". */
export const VARIANTS_SHOWN = 3;

/**
 * Hur mycket varje livsmedel används: varje loggpost ger 1 poäng som halveras var 30:e dag
 * (frekvens och hur nyligen i ett tal). Framtida poster räknas som idag.
 */
export function usageScores(
  log: readonly Pick<FoodLogEntry, 'foodId' | 'date'>[],
  today: string,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const e of log) {
    const age = Math.max(0, daysBetween(e.date, today));
    const weight = 0.5 ** (age / USAGE_HALF_LIFE_DAYS);
    scores.set(e.foodId, (scores.get(e.foodId) ?? 0) + weight);
  }
  return scores;
}

/** Användarens egna: livsmedel, måltider och recept. */
export function isOwn(item: Pick<FoodItem, 'source'>): boolean {
  return item.source === 'egen' || item.source === 'maltid' || item.source === 'recept';
}

/**
 * Sökprioriteten (`searchIndex`): egna och loggade livsmedel får sin användningspoäng (egna
 * som aldrig loggats 0), övriga `null` och sorteras efter träffen.
 */
export function searchPriority(
  scores: ReadonlyMap<string, number>,
): (item: Pick<FoodItem, 'id' | 'source'>) => number | null {
  return (item) => scores.get(item.id) ?? (isOwn(item) ? 0 : null);
}

/** Ord i namnet som skiljer varianter åt: inga småord och inga tal ("3 %"). */
function significantWords(name: string): string[] {
  return normalize(name)
    .split(' ')
    .filter((w) => w !== '' && !FILLER_WORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Nyckel för närliggande varianter: namnets två första betydelsebärande ord. "Bröd fullkorn
 * råg" och "Bröd, fullkorn, vete" ger båda `brod fullkorn`.
 */
export function variantKey(name: string): string {
  return significantWords(name).slice(0, 2).join(' ');
}

/** Variantens namn som det står i det första livsmedlet: "Bröd fullkorn". */
export function variantLabel(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter((w) => {
    const n = normalize(w);
    return n !== '' && !FILLER_WORDS.has(n) && !/^\d+$/.test(n);
  });
  return words.slice(0, 2).join(' ');
}

export type ResultRow<T> =
  | { kind: 'item'; item: T }
  | {
      kind: 'more';
      /** Variantens nyckel (`variantKey`) – fäll ut med den. */
      key: string;
      /** "Bröd fullkorn". */
      label: string;
      /** Antal dolda varianter. */
      hidden: number;
    };

/**
 * Sökträffarna som rader: högst `max` per variant, sedan en rad "Visa fler varianter" på den
 * sista visade variantens plats. Skyddade träffar (egna och loggade) räknas aldrig bort och
 * fälls aldrig ihop. Varianter i `expanded` visas helt. Högst `limit` livsmedel visas.
 */
export function collapseVariants<T extends FoodItem>(
  items: readonly T[],
  options: {
    expanded?: ReadonlySet<string>;
    protect?: (item: T) => boolean;
    max?: number;
    limit?: number;
  } = {},
): ResultRow<T>[] {
  const { expanded = new Set(), protect = () => false, max = VARIANTS_SHOWN } = options;
  const limit = options.limit ?? Infinity;
  const keyOf = (item: T): string | null => {
    if (protect(item)) return null;
    const key = variantKey(item.name);
    return key === '' ? null : key;
  };
  const totals = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    if (key !== null) totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const shown = new Map<string, number>();
  const rows: ResultRow<T>[] = [];
  let count = 0;
  for (const item of items) {
    if (count >= limit) break;
    const key = keyOf(item);
    if (key === null || expanded.has(key)) {
      rows.push({ kind: 'item', item });
      count += 1;
      continue;
    }
    const n = shown.get(key) ?? 0;
    if (n >= max) continue;
    shown.set(key, n + 1);
    rows.push({ kind: 'item', item });
    count += 1;
    const total = totals.get(key) ?? 0;
    if (n + 1 === max && total > max) {
      rows.push({ kind: 'more', key, label: variantLabel(item.name), hidden: total - max });
    }
  }
  return rows;
}
