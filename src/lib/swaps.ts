/**
 * Bytesförslag: för posterna som bidrar mest med energi, ett livsmedel i samma
 * kategori (se `foodProfile`) med klart bättre protein per kcal eller mer fiber –
 * utan att energin ökar. Effekten räknas för samma mängd. Rena funktioner.
 */
import type { FoodCategory } from '../data/foodCategories.ts';
import type { FoodLogEntry } from '../db/db.ts';
import { formatInt } from './format.ts';
import type { FoodItem } from './foodSearch.ts';
import { normalize } from './foodSearch.ts';
import { scaleNutrients } from './nutrition.ts';
import { foodProfile } from './units.ts';
import { isAlcoholic } from './water.ts';

/** Kategorier där ett byte inom kategorin inte blir meningsfullt. */
const NO_SWAP: ReadonlySet<FoodCategory> = new Set(['ovrigt', 'maltid', 'kryddor', 'sas']);

/** Protein per 100 kcal måste öka med minst så här mycket (g) … */
export const MIN_PROTEIN_GAIN = 3;
/** … och med minst så här stor faktor. */
export const MIN_PROTEIN_FACTOR = 1.3;
/** Fiber per 100 kcal måste öka med minst så här mycket (g) … */
export const MIN_FIBER_GAIN = 1;
export const MIN_FIBER_FACTOR = 1.5;
/** Energin för samma mängd får öka med högst 5 %. */
const MAX_KCAL_INCREASE = 1.05;
/** Ersättningen ska ha minst 40 % av energin – inte sallad i stället för pasta. */
const MIN_KCAL_RATIO = 0.4;

export interface SwapCandidate {
  food: FoodItem;
  category: FoodCategory;
}

/** Kandidaterna med kategori, en gång per livsmedelsdatabas. */
export function swapCandidates(foods: readonly FoodItem[]): SwapCandidate[] {
  const result: SwapCandidate[] = [];
  for (const food of foods) {
    if (!(food.per100.kcal > 0) || isAlcoholic(food.name)) continue;
    const { category } = foodProfile(food);
    if (!NO_SWAP.has(category)) result.push({ food, category });
  }
  return result;
}

export interface SwapSuggestion {
  entryId: string;
  fromName: string;
  toName: string;
  toId: string;
  grams: number;
  deltaKcal: number;
  deltaProteinG: number;
  /** `null` om fiber inte är känd för båda. */
  deltaFiberG: number | null;
  text: string;
}

function per100Kcal(value: number, kcal: number): number {
  return kcal > 0 ? (value / kcal) * 100 : 0;
}

function signed(value: number, unit: string): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±';
  return `${sign}${formatInt(Math.abs(rounded))} ${unit}`;
}

/** "Byt Yoghurt mot Kvarg: −40 kcal, +12 g protein". */
export function swapText(s: Omit<SwapSuggestion, 'text'>): string {
  const parts = [signed(s.deltaKcal, 'kcal'), `${signed(s.deltaProteinG, 'g')} protein`];
  if (s.deltaFiberG !== null && Math.round(s.deltaFiberG) >= 1) {
    parts.push(`${signed(s.deltaFiberG, 'g')} fiber`);
  }
  return `Byt ${s.fromName} mot ${s.toName}: ${parts.join(', ')}`;
}

/** Ord i namnet (normaliserat, minst tre tecken) – för att föredra liknande livsmedel. */
function words(name: string): Set<string> {
  return new Set(
    normalize(name)
      .split(' ')
      .filter((w) => w.length >= 3),
  );
}

/**
 * Upp till `limit` förslag, ett per post, för posterna med mest energi (sparade
 * måltider hoppas över). `catalog` ger livsmedlets aktuella data (grupp, fiber).
 */
export function suggestSwaps(
  entries: readonly FoodLogEntry[],
  candidates: readonly SwapCandidate[],
  catalog: ReadonlyMap<string, FoodItem>,
  limit = 3,
): SwapSuggestion[] {
  const top = entries
    .filter((e) => !e.foodId.startsWith('maltid:') && e.grams > 0)
    .map((e) => ({ entry: e, kcal: scaleNutrients(e.per100, e.grams).kcal }))
    .filter((x) => x.kcal > 0)
    .sort((a, b) => b.kcal - a.kcal)
    .slice(0, limit);

  const result: SwapSuggestion[] = [];
  const used = new Set<string>();
  for (const { entry } of top) {
    const known = catalog.get(entry.foodId);
    const food: FoodItem = known
      ? { ...known }
      : { id: entry.foodId, name: entry.name, source: 'egen', per100: entry.per100 };
    if (entry.per100Unit === 'ml') food.per100Unit = 'ml';
    const { category } = foodProfile(food);
    if (NO_SWAP.has(category)) continue;
    const from = entry.per100;
    const fromProtein = per100Kcal(from.proteinG, from.kcal);
    const fromFiber = known?.extra?.fiberG;
    const fromWords = words(entry.name);

    let best: { swap: Omit<SwapSuggestion, 'text'>; score: number } | null = null;
    for (const c of candidates) {
      if (c.category !== category || c.food.id === entry.foodId || used.has(c.food.id)) continue;
      const to = c.food.per100;
      if (to.kcal > from.kcal * MAX_KCAL_INCREASE || to.kcal < from.kcal * MIN_KCAL_RATIO) continue;
      const toProtein = per100Kcal(to.proteinG, to.kcal);
      const proteinBetter =
        toProtein - fromProtein >= MIN_PROTEIN_GAIN &&
        toProtein >= Math.max(fromProtein * MIN_PROTEIN_FACTOR, 1);
      const toFiber = c.food.extra?.fiberG;
      const fiberKnown = fromFiber !== undefined && toFiber !== undefined;
      const fiberBetter =
        fiberKnown &&
        per100Kcal(toFiber, to.kcal) - per100Kcal(fromFiber, from.kcal) >= MIN_FIBER_GAIN &&
        per100Kcal(toFiber, to.kcal) >= per100Kcal(fromFiber, from.kcal) * MIN_FIBER_FACTOR;
      // Mindre protein är aldrig ett bättre byte, även om fibern ökar.
      if (!proteinBetter && !(fiberBetter && to.proteinG >= from.proteinG * 0.9)) continue;
      const deltaKcal = ((to.kcal - from.kcal) * entry.grams) / 100;
      const deltaProteinG = ((to.proteinG - from.proteinG) * entry.grams) / 100;
      const deltaFiberG = fiberKnown ? ((toFiber - fromFiber) * entry.grams) / 100 : null;
      const shared = [...words(c.food.name)].filter((w) => fromWords.has(w)).length;
      const score =
        -deltaKcal / 10 +
        deltaProteinG * 2 +
        (deltaFiberG ?? 0) * 3 +
        shared * 5 -
        c.food.name.length / 50;
      if (best === null || score > best.score) {
        best = {
          score,
          swap: {
            entryId: entry.id,
            fromName: entry.name,
            toName: c.food.name,
            toId: c.food.id,
            grams: entry.grams,
            deltaKcal,
            deltaProteinG,
            deltaFiberG,
          },
        };
      }
    }
    if (best) {
      used.add(best.swap.toId);
      result.push({ ...best.swap, text: swapText(best.swap) });
    }
  }
  return result;
}
