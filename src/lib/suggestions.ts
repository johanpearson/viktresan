/**
 * "Föreslå" i Mat: förslag på vad man kan äta i en måltid utifrån det man brukar äta och det
 * som är kvar av dagens mål. Helt lokalt – rena funktioner utan I/O.
 *
 * - **Kandidater**: livsmedel loggade de senaste 28 dagarna, favoriter, egna måltider och
 *   recept. Mängden är användarens typiska (median av tidigare loggar), annars standardportionen.
 *   Har måltiden färre än 5 egna kandidater fylls det på med startlistan (`src/data/suggestions.ts`),
 *   med en vikt som minskar när historiken växer.
 * - **Vikt**: hur ofta och hur nyligen det loggats, och hur stor del av loggarna som var i just
 *   den måltiden. "Inte intresserad" döljer förslaget och nedviktar liknande (samma kategori).
 * - **Kombinationer**: två kandidater som ofta loggats ihop i måltiden, eller en proteinrik och
 *   en fiberrik som kompletterar varandra.
 * - **Poäng**: belönar det som fyller det näringsämne (protein, fiber) som ligger lägst i procent
 *   av målet, räknat per kcal. Portionstak = användarens typiska kcal för måltiden (median de
 *   senaste 28 dagarna), aldrig mer än det som är kvar. Förslag som går över dagens kcal-mål
 *   straffas och visas inte.
 * - **Lågt läge**: under 150 kcal kvar (eller över målet) föreslås bara energisnåla alternativ,
 *   med en saklig rad – aldrig uppmaningar att äta för att nå protein- eller fibermål.
 */
import type { ClaimId } from '../data/nutritionClaims.ts';
import { START_SUGGESTIONS, type StartSuggestion } from '../data/suggestions.ts';
import type { Favorite, FoodLogEntry } from '../db/db.ts';
import { claimsFor } from './claims.ts';
import { addDays, daysBetween } from './dates.ts';
import { fiberForItem, fiberOfEntries, type FiberSource } from './fiber.ts';
import { entryToItem } from './foodCatalog.ts';
import { normalize, type FoodItem } from './foodSearch.ts';
import { formatInt, formatKcal } from './format.ts';
import { mealLabel, scaleNutrients, totalOf, type MealSlot, type Nutrients } from './nutrition.ts';
import {
  GRAM,
  foodProfile,
  gramsPerUnit,
  initialUsage,
  isGram,
  loggedAmountText,
  round1,
  unitsFor,
  type FoodUnit,
} from './units.ts';

/** Fönstret för historiken (kandidater, vikter, typisk måltid). */
export const HISTORY_DAYS = 28;
/** Under så här många kcal kvar föreslås bara energisnåla alternativ. */
export const LOW_KCAL_LIMIT = 150;
/** Färre egna kandidater än så här i måltiden → startlistan fyller på. */
export const MIN_OWN_CANDIDATES = 5;
/** Förslag per sida ("Visa fler" visar nästa sida). */
export const SUGGESTION_PAGE = 3;
/** Högst så många förslag totalt. */
export const MAX_SUGGESTIONS = 12;
/** Från klockan 20 nämns inte protein eller fiber i lägesraden. */
export const LATE_HOUR = 20;

/** Texten i lågt läge (under 150 kcal kvar eller över målet). */
export const LOW_TEXT = 'Du har nått dagens mål. Är du hungrig finns lätta alternativ här.';

/** Måltidens andel av dagsmålet när det saknas egen historik för den. */
const SLOT_SHARE: Record<MealSlot, number> = {
  frukost: 0.25,
  lunch: 0.3,
  middag: 0.3,
  mellanmal: 0.15,
};
/** Dagsmål att räkna andelar mot när kalorimålet saknas. */
const DEFAULT_DAY_KCAL = 2000;
/** Kategorier som inte är något att äta för sig (kryddor, såser, fett). */
const NOT_STANDALONE: ReadonlySet<string> = new Set([
  'kryddor',
  'sas',
  'olja',
  'matfett',
  'socker',
]);
/** Förslag under så här många kcal är inte värda en rad (vatten, kaffe …). */
const MIN_KCAL = 10;
/** Utan fiberdata: bara livsmedlets egna värden (startlistan har sina). */
const NO_FIBER: FiberSource = { meals: [], lookup: () => null };

// ---------------------------------------------------------------------------
// Typisk mängd

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? hi : ((sorted[mid - 1] ?? hi) + hi) / 2;
}

/** En mängd att logga: `unit` = `g` för gram. */
export interface Amount {
  amount: number;
  unit: string;
  grams: number;
}

/** Gram avrundat till 5 g (under 20 g till hela gram). */
function roundGrams(grams: number): number {
  return grams < 20 ? Math.max(1, Math.round(grams)) : Math.round(grams / 5) * 5;
}

/** Antal av en enhet avrundat till halvor, minst ½. */
function roundCount(count: number): number {
  return Math.max(0.5, Math.round(count * 2) / 2);
}

/**
 * Användarens typiska mängd av ett livsmedel: medianen av de loggade gram, i den enhet som
 * använts oftast (vid lika: den senaste). `null` utan loggar.
 */
export function typicalAmount(
  entries: readonly (Amount & { createdAt?: number })[],
): Amount | null {
  const grams = median(entries.map((e) => e.grams));
  if (grams === null || !(grams > 0)) return null;
  const counts = new Map<string, { n: number; last: number }>();
  for (const e of entries) {
    const key = isGram(e.unit) ? GRAM : e.unit;
    const prev = counts.get(key);
    const at = e.createdAt ?? 0;
    counts.set(key, { n: (prev?.n ?? 0) + 1, last: Math.max(prev?.last ?? 0, at) });
  }
  const [unit] = [...counts.entries()].sort(([, a], [, b]) => b.n - a.n || b.last - a.last)[0] ?? [
    GRAM,
  ];
  if (unit === GRAM) {
    const g = roundGrams(grams);
    return { amount: g, unit: GRAM, grams: g };
  }
  // Enhetens vikt som den var när posterna loggades.
  const perUnit = median(
    entries.filter((e) => e.unit === unit && e.amount > 0).map((e) => e.grams / e.amount),
  );
  if (perUnit === null || !(perUnit > 0)) {
    const g = roundGrams(grams);
    return { amount: g, unit: GRAM, grams: g };
  }
  const amount = roundCount(grams / perUnit);
  return { amount, unit, grams: round1(amount * perUnit) };
}

/** Standardportionen: första enheten med känd vikt (portion, st, skiva …), annars 100 g. */
export function standardAmount(food: FoodItem, custom: readonly FoodUnit[] = []): Amount {
  const units = unitsFor(food, custom);
  const usage = initialUsage(units, null);
  const perUnit = gramsPerUnit(units, usage.unit);
  if (isGram(usage.unit) || perUnit === null) return { amount: 100, unit: GRAM, grams: 100 };
  return { amount: usage.amount, unit: usage.unit, grams: round1(usage.amount * perUnit) };
}

// ---------------------------------------------------------------------------
// Historik och vikt

export interface FoodStats {
  foodId: string;
  count: number;
  /** Antal loggar per måltid. */
  slots: Record<MealSlot, number>;
  lastDate: string;
  /** Posterna (senast loggade sist). */
  entries: FoodLogEntry[];
}

function emptySlots(): Record<MealSlot, number> {
  return { frukost: 0, lunch: 0, middag: 0, mellanmal: 0 };
}

/** Loggar som räknas: inte snabbloggar (bara uppskattade kcal). */
function countable(entry: FoodLogEntry): boolean {
  return !entry.estimated && !entry.foodId.startsWith('snabb:');
}

/** Posterna de senaste `days` dagarna före `today` (idag är inte slut). */
export function recentEntries(
  log: readonly FoodLogEntry[],
  today: string,
  days = HISTORY_DAYS,
): FoodLogEntry[] {
  const from = addDays(today, -days);
  return log.filter((e) => e.date >= from && e.date < today && countable(e));
}

/** Loggstatistik per livsmedel de senaste 28 dagarna (före idag). */
export function historyStats(
  log: readonly FoodLogEntry[],
  today: string,
  days = HISTORY_DAYS,
): Map<string, FoodStats> {
  const stats = new Map<string, FoodStats>();
  const sorted = recentEntries(log, today, days).sort((a, b) => a.createdAt - b.createdAt);
  for (const e of sorted) {
    let s = stats.get(e.foodId);
    if (!s) {
      s = { foodId: e.foodId, count: 0, slots: emptySlots(), lastDate: e.date, entries: [] };
      stats.set(e.foodId, s);
    }
    s.count += 1;
    s.slots[e.meal] += 1;
    if (e.date > s.lastDate) s.lastDate = e.date;
    s.entries.push(e);
  }
  return stats;
}

/**
 * Hur väl ett livsmedel passar måltiden, 0–1: hur ofta det loggats (mättas vid ~10 gånger) och
 * hur nyligen (halveras varje vecka), gånger hur stor del av loggarna som var i just den måltiden.
 */
export function historyWeight(stats: FoodStats, slot: MealSlot, today: string): number {
  const frequency = stats.count / (stats.count + 4);
  const recency = 0.5 ** (Math.max(0, daysBetween(stats.lastDate, today) - 1) / 7);
  const slotShare = stats.slots[slot] / stats.count;
  // Aldrig loggat i måltiden: en tredjedel av vikten (gröt till frukost är inget självklart mellanmål).
  return (0.5 * frequency + 0.5 * recency) * (0.35 + 0.65 * slotShare);
}

/**
 * Måltidens typiska kcal: medianen av måltidens summa per dag de senaste 28 dagarna (dagar med
 * minst en post i måltiden, minst 3 dagar). Annars måltidens andel av dagsmålet.
 */
export function typicalSlotKcal(
  log: readonly FoodLogEntry[],
  slot: MealSlot,
  today: string,
  targetKcal: number | null,
): number {
  const byDate = new Map<string, number>();
  for (const e of log) {
    if (e.meal !== slot) continue;
    if (e.date < addDays(today, -HISTORY_DAYS) || e.date >= today) continue;
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + scaleNutrients(e.per100, e.grams).kcal);
  }
  const days = [...byDate.values()];
  const typical = days.length >= 3 ? median(days) : null;
  return typical ?? SLOT_SHARE[slot] * (targetKcal ?? DEFAULT_DAY_KCAL);
}

// ---------------------------------------------------------------------------
// Kandidater

export interface SuggestionPart extends Amount {
  food: FoodItem;
}

export type Origin = 'history' | 'favorite' | 'dish' | 'start';

export interface Candidate {
  /** Stabil nyckel: livsmedlets id, eller två id:n med "+" för en kombination. */
  key: string;
  parts: SuggestionPart[];
  /** Hur väl det passar måltiden och användaren, 0–1 (ungefär). */
  weight: number;
  origin: Origin;
  /** Från startlistan ("Allmänt förslag"). */
  general: boolean;
}

/** Ett förslag som användaren inte är intresserad av. */
export interface HiddenSuggestion {
  key: string;
  name: string;
}

/** Startlistans förslag som `FoodItem`: databasens aktuella värden om livsmedlet finns. */
export function startFood(
  start: StartSuggestion,
  catalog: ReadonlyMap<string, FoodItem>,
): FoodItem {
  const known = catalog.get(start.id);
  if (known) return known;
  const item: FoodItem = {
    id: start.id,
    name: start.name,
    source: start.id.startsWith('fi:') ? 'fineli' : 'livsmedelsverket',
    per100: start.per100,
  };
  if (start.fiberG !== null) item.extra = { fiberG: start.fiberG };
  return item;
}

/** Startlistans mängd, räknad med livsmedlets enheter om enheten finns (annars gram). */
export function startAmount(
  start: StartSuggestion,
  food: FoodItem,
  custom: readonly FoodUnit[],
): Amount {
  if (isGram(start.unit)) return { amount: start.grams, unit: GRAM, grams: start.grams };
  const perUnit = gramsPerUnit(unitsFor(food, custom), start.unit);
  if (perUnit === null) return { amount: start.grams, unit: GRAM, grams: start.grams };
  return { amount: start.amount, unit: start.unit, grams: round1(start.amount * perUnit) };
}

function keyFoods(key: string): string[] {
  return key.split('+');
}

/** Kategorin och första ordet – det som gör två förslag "lika". */
function likeness(food: { id: string; name: string }): { category: string; word: string } {
  return {
    category: foodProfile(food).category,
    word: normalize(food.name).split(' ')[0] ?? '',
  };
}

/**
 * Nedviktning för förslag som liknar något användaren inte är intresserad av: samma första ord
 * (×0,4) eller samma kategori (×0,75). Kategorierna `ovrigt` och `maltid` säger för lite.
 */
export function dislikeFactor(food: FoodItem, hidden: readonly HiddenSuggestion[]): number {
  const me = likeness(food);
  let factor = 1;
  for (const h of hidden) {
    for (const id of keyFoods(h.key)) {
      if (id === food.id) continue;
      const other = likeness({ id, name: h.name });
      if (me.word !== '' && other.word === me.word) factor = Math.min(factor, 0.4);
      else if (
        other.category === me.category &&
        me.category !== 'ovrigt' &&
        me.category !== 'maltid'
      ) {
        factor = Math.min(factor, 0.75);
      }
    }
  }
  return factor;
}

function worthSuggesting(food: FoodItem, amount: Amount): boolean {
  if (food.source === 'snabb') return false;
  if (NOT_STANDALONE.has(foodProfile(food).category)) return false;
  return scaleNutrients(food.per100, amount.grams).kcal >= MIN_KCAL;
}

export interface CandidateInput {
  slot: MealSlot;
  today: string;
  log: readonly FoodLogEntry[];
  /** Alla livsmedel, måltider och recept (id → livsmedel). */
  catalog: ReadonlyMap<string, FoodItem>;
  favorites: readonly Favorite[];
  /** Egna måltider och recept som livsmedel. */
  dishes: readonly FoodItem[];
  customUnits?: ReadonlyMap<string, readonly FoodUnit[]>;
  hidden?: readonly HiddenSuggestion[];
  /** Startlistan (standard: `START_SUGGESTIONS`). */
  start?: readonly StartSuggestion[];
  /** Lågt läge: startlistans energisnåla förslag tas med oavsett måltid och historik. */
  lowEnergyOnly?: boolean;
}

/** Tillägg för egen data – den går före startlistan vid likvärdig näring. */
const OWN_BONUS = 0.25;
const FAVORITE_BONUS = 0.15;
const START_WEIGHT = 0.3;

/**
 * Kandidaterna för en måltid (utan kombinationer): egen historik, favoriter, egna måltider och
 * recept, och vid behov startlistan. Dolda förslag och det som redan loggats i måltiden idag
 * tas inte med.
 */
export function candidatesFor(input: CandidateInput): Candidate[] {
  const { slot, today, log, catalog } = input;
  const custom = (id: string) => input.customUnits?.get(id) ?? [];
  const hidden = input.hidden ?? [];
  const hiddenKeys = new Set(hidden.map((h) => h.key));
  const loggedNow = new Set(
    log.filter((e) => e.date === today && e.meal === slot).map((e) => e.foodId),
  );
  const favoriteIds = new Set(input.favorites.map((f) => f.foodId));
  const stats = historyStats(log, today);
  const result = new Map<string, Candidate>();

  function add(food: FoodItem, amount: Amount, weight: number, origin: Origin, general: boolean) {
    if (hiddenKeys.has(food.id) || loggedNow.has(food.id) || result.has(food.id)) return;
    if (!worthSuggesting(food, amount)) return;
    const w = weight * dislikeFactor(food, hidden);
    result.set(food.id, { key: food.id, parts: [{ food, ...amount }], weight: w, origin, general });
  }

  for (const s of stats.values()) {
    const last = s.entries[s.entries.length - 1];
    if (!last) continue;
    const food = catalog.get(s.foodId) ?? entryToItem(last);
    const amount = typicalAmount(s.entries) ?? standardAmount(food, custom(food.id));
    const favorite = favoriteIds.has(s.foodId) ? FAVORITE_BONUS : 0;
    add(food, amount, OWN_BONUS + historyWeight(s, slot, today) + favorite, 'history', false);
  }
  for (const fav of input.favorites) {
    const food = catalog.get(fav.foodId);
    if (food) add(food, standardAmount(food, custom(food.id)), OWN_BONUS + 0.1, 'favorite', false);
  }
  for (const dish of input.dishes) {
    add(dish, standardAmount(dish, custom(dish.id)), OWN_BONUS, 'dish', false);
  }

  // Egna kandidater som faktiskt loggats i måltiden avgör hur mycket startlistan behövs.
  const ownInSlot = [...stats.values()].filter(
    (s) => s.slots[slot] > 0 && result.has(s.foodId),
  ).length;
  const startFactor = ownInSlot >= MIN_OWN_CANDIDATES ? 0 : 1 - ownInSlot / MIN_OWN_CANDIDATES / 2;
  // Har användaren en egen variant (samma första ord: "Kvarg vanilj" – "Kvarg naturell") går den före.
  const ownWords = new Set(
    [...result.values()].flatMap((c) => c.parts.map((p) => likeness(p.food).word)),
  );
  for (const start of input.start ?? START_SUGGESTIONS) {
    const food = startFood(start, catalog);
    if (ownWords.has(likeness(food).word)) continue;
    const lowEnergy = input.lowEnergyOnly === true && claimsFor(food, null).includes('energisnal');
    if (!lowEnergy && (startFactor === 0 || !start.slots.includes(slot))) continue;
    const weight = START_WEIGHT * (lowEnergy ? Math.max(startFactor, 0.5) : startFactor);
    add(food, startAmount(start, food, custom(food.id)), weight, 'start', true);
  }
  return [...result.values()];
}

/** Antal egna kandidater (loggade i måltiden de senaste 28 dagarna). */
export function ownSlotCount(log: readonly FoodLogEntry[], slot: MealSlot, today: string): number {
  return [...historyStats(log, today).values()].filter((s) => s.slots[slot] > 0).length;
}

// ---------------------------------------------------------------------------
// Kombinationer

/** Par av livsmedel loggade i samma måltid samma dag, med antal (nyckel "a+b", sorterad). */
export function coLogged(
  log: readonly FoodLogEntry[],
  slot: MealSlot,
  today: string,
): Map<string, number> {
  const groups = new Map<string, Set<string>>();
  for (const e of recentEntries(log, today)) {
    if (e.meal !== slot) continue;
    const set = groups.get(e.date) ?? new Set<string>();
    set.add(e.foodId);
    groups.set(e.date, set);
  }
  const pairs = new Map<string, number>();
  for (const ids of groups.values()) {
    const list = [...ids].sort();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = `${list[i] ?? ''}+${list[j] ?? ''}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  return pairs;
}

function comboOf(a: Candidate, b: Candidate, weight: number): Candidate {
  const [first, second] = a.key < b.key ? [a, b] : [b, a];
  return {
    key: `${first.key}+${second.key}`,
    parts: [...first.parts, ...second.parts],
    weight,
    origin: a.origin === 'start' && b.origin === 'start' ? 'start' : 'history',
    general: a.general || b.general,
  };
}

/**
 * Kombinationer av två kandidater: par som loggats ihop i måltiden minst två gånger, och par
 * där den ena är proteinrik och den andra fiberrik (t.ex. kvarg och bär) bland de sex mest
 * relevanta. Högst `limit` stycken.
 */
export function combinations(
  candidates: readonly Candidate[],
  log: readonly FoodLogEntry[],
  slot: MealSlot,
  today: string,
  fiberSource: FiberSource | null,
  hiddenKeys: ReadonlySet<string> = new Set(),
  limit = 6,
): Candidate[] {
  const single = candidates.filter((c) => c.parts.length === 1);
  const byId = new Map(single.map((c) => [c.key, c]));
  const result = new Map<string, Candidate>();
  for (const [key, count] of coLogged(log, slot, today)) {
    if (count < 2) continue;
    const [a, b] = keyFoods(key).map((id) => byId.get(id));
    if (!a || !b) continue;
    const combo = comboOf(a, b, (a.weight + b.weight) / 2 + 0.1 * Math.min(count, 5));
    if (!hiddenKeys.has(combo.key)) result.set(combo.key, combo);
  }
  const top = [...single].sort((x, y) => y.weight - x.weight).slice(0, 6);
  const tagged = top.map((c) => ({ c, claims: claimsOfParts(c.parts, fiberSource) }));
  for (const p of tagged) {
    if (!p.claims.includes('proteinrik') || p.claims.includes('fiberrik')) continue;
    for (const f of tagged) {
      if (f === p || !f.claims.includes('fiberrik') || f.claims.includes('proteinrik')) continue;
      const pFood = p.c.parts[0]?.food;
      const fFood = f.c.parts[0]?.food;
      if (!pFood || !fFood || foodProfile(pFood).category === foodProfile(fFood).category) continue;
      const combo = comboOf(p.c, f.c, ((p.c.weight + f.c.weight) / 2) * 0.85);
      if (!hiddenKeys.has(combo.key) && !result.has(combo.key)) result.set(combo.key, combo);
    }
  }
  return [...result.values()].sort((x, y) => y.weight - x.weight).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Näring, portionstak och poäng

export interface Goals {
  targetKcal: number | null;
  proteinGoalG: number | null;
  /** Dagens fibermål (veckans mål under upptrappningen). */
  fiberGoalG: number | null;
}

/** Dagens intag hittills. `fiberG` = känd fiber (poster utan fiberdata räknas inte). */
export interface Eaten {
  kcal: number;
  proteinG: number;
  fiberG: number;
}

export interface Remaining {
  kcal: number | null;
  proteinG: number | null;
  fiberG: number | null;
}

export function remainingOf(eaten: Eaten, goals: Goals): Remaining {
  return {
    kcal: goals.targetKcal === null ? null : goals.targetKcal - eaten.kcal,
    proteinG: goals.proteinGoalG === null ? null : goals.proteinGoalG - eaten.proteinG,
    fiberG: goals.fiberGoalG === null ? null : goals.fiberGoalG - eaten.fiberG,
  };
}

/** Lågt läge: under 150 kcal kvar eller över dagens mål. */
export function isLowMode(remaining: Remaining): boolean {
  return remaining.kcal !== null && remaining.kcal < LOW_KCAL_LIMIT;
}

/** Portionstaket: måltidens typiska kcal, men aldrig mer än det som är kvar (lågt läge: 100 kcal). */
export function portionCap(typicalKcal: number, remaining: Remaining): number {
  if (isLowMode(remaining)) return 100;
  const left = remaining.kcal ?? Infinity;
  return Math.max(50, Math.min(typicalKcal, left));
}

export interface Values {
  kcal: number;
  proteinG: number;
  /** `null` = fiberdata saknas. */
  fiberG: number | null;
}

export function partValues(
  part: SuggestionPart,
  fiberSource: FiberSource | null,
): Values & Nutrients {
  const n = scaleNutrients(part.food.per100, part.grams);
  const fiber = fiberForItem(part.food, part.grams, fiberSource ?? NO_FIBER);
  return { ...n, fiberG: fiber ? fiber.fiberG : null };
}

export function valuesOf(
  parts: readonly SuggestionPart[],
  fiberSource: FiberSource | null,
): Values & Nutrients {
  const list = parts.map((p) => partValues(p, fiberSource));
  const known = list.filter((v) => v.fiberG !== null);
  return {
    kcal: list.reduce((s, v) => s + v.kcal, 0),
    proteinG: list.reduce((s, v) => s + v.proteinG, 0),
    carbsG: list.reduce((s, v) => s + v.carbsG, 0),
    fatG: list.reduce((s, v) => s + v.fatG, 0),
    fiberG: known.length === 0 ? null : known.reduce((s, v) => s + (v.fiberG ?? 0), 0),
  };
}

/**
 * Skalar ner en kandidat som är mycket större än portionstaket (mer än 25 % över) så att den
 * ryms: gram i steg om 5 g, enheter i halvor. Aldrig under hälften av mängden.
 */
export function fitPortion(
  parts: readonly SuggestionPart[],
  kcal: number,
  cap: number,
): SuggestionPart[] {
  if (!(kcal > cap * 1.25) || !(kcal > 0)) return [...parts];
  const factor = Math.max(0.5, cap / kcal);
  return parts.map((p) => {
    if (p.unit === GRAM) {
      const g = roundGrams(p.grams * factor);
      return { ...p, amount: g, grams: g };
    }
    const perUnit = p.amount > 0 ? p.grams / p.amount : p.grams;
    const amount = Math.max(roundCount(p.amount * factor), p.amount >= 1 ? 0.5 : p.amount);
    return { ...p, amount, grams: round1(amount * perUnit) };
  });
}

export interface ScoreContext {
  eaten: Eaten;
  goals: Goals;
  remaining: Remaining;
  /** Portionstaket i kcal. */
  cap: number;
  low: boolean;
}

/** Andel av målet som ätits (0 = inget, 1 = nått). `null` utan mål. */
function progress(eaten: number, goal: number | null): number | null {
  return goal === null || !(goal > 0) ? null : eaten / goal;
}

/**
 * Hur väl förslaget fyller det som ligger lågt: för protein och fiber, andelen av det som är
 * kvar till målet som förslaget fyller, jämfört med andelen av dagens kcal det kostar (mättas
 * vid dubbla). Viktas med hur långt från målet man är; det näringsämne som ligger lägst i procent
 * väger 1,5 gånger mer.
 */
export function nutritionScore(values: Values, ctx: ScoreContext): number {
  const dayKcal = ctx.goals.targetKcal ?? DEFAULT_DAY_KCAL;
  const kcalShare = Math.max(values.kcal / dayKcal, 0.02);
  const nutrients = [
    { goal: ctx.goals.proteinGoalG, eaten: ctx.eaten.proteinG, gain: values.proteinG },
    { goal: ctx.goals.fiberGoalG, eaten: ctx.eaten.fiberG, gain: values.fiberG ?? 0 },
  ]
    .map((n) => ({ ...n, p: progress(n.eaten, n.goal) }))
    .filter((n): n is typeof n & { goal: number; p: number } => n.p !== null && n.goal !== null);
  const lowest = Math.min(...nutrients.map((n) => n.p));
  let score = 0;
  for (const n of nutrients) {
    const lag = Math.min(1, Math.max(0, 1 - n.p));
    if (lag === 0) continue;
    const filled = Math.min(n.gain, n.goal - n.eaten) / n.goal;
    const density = Math.min(2, filled / kcalShare) / 2;
    score += lag * density * (n.p === lowest ? 1.5 : 1);
  }
  return score;
}

/** Straff för en portion långt från portionstaket: mycket över straffas hårt, lite under milt. */
export function portionPenalty(kcal: number, cap: number): number {
  const ratio = kcal / cap;
  if (ratio > 1.2) return (ratio - 1.2) * 1.5;
  if (ratio < 0.3) return (0.3 - ratio) * 0.8;
  return 0;
}

/** Straff för att gå över dagens kcal-mål (eller komma mycket nära det). */
export function overBudgetPenalty(kcal: number, remainingKcal: number | null): number {
  if (remainingKcal === null) return 0;
  if (kcal > remainingKcal) return 1 + (kcal - remainingKcal) / 100;
  if (remainingKcal > 0 && kcal > remainingKcal * 0.8) return 0.2;
  return 0;
}

/**
 * Förslagets poäng: vikt (vana) + näring − portion − över målet. Vanan väger tyngst, så att egen
 * historik går före startlistan när näringen är likvärdig. Lågt läge: vana + lätthet.
 */
export function scoreCandidate(weight: number, values: Values, ctx: ScoreContext): number {
  if (ctx.low) return 0.6 * weight - values.kcal / 200;
  return (
    0.9 * weight +
    0.6 * nutritionScore(values, ctx) -
    portionPenalty(values.kcal, ctx.cap) -
    overBudgetPenalty(values.kcal, ctx.remaining.kcal)
  );
}

// ---------------------------------------------------------------------------
// Förslagen

export interface Suggestion extends Candidate {
  /** "Kvarg naturell" eller "Kvarg naturell + Blåbär". */
  name: string;
  values: Values & Nutrients;
  claims: ClaimId[];
  score: number;
}

export interface SuggestInput extends CandidateInput {
  hour: number;
  goals: Goals;
  fiberSource: FiberSource | null;
}

export type SuggestMode = 'normal' | 'low' | 'empty';

export interface SuggestResult {
  mode: SuggestMode;
  /** Lägesraden överst, t.ex. "Lite lågt på protein idag · 640 kcal kvar". */
  status: string;
  eaten: Eaten;
  remaining: Remaining;
  /** Måltidens typiska kcal (portionstakets utgångspunkt). */
  typicalKcal: number;
  cap: number;
  /** Rangordnade, högst `MAX_SUGGESTIONS`; visas tre i taget. */
  suggestions: Suggestion[];
}

/** Dagens intag hittills (kcal, protein och känd fiber). */
export function eatenToday(
  log: readonly FoodLogEntry[],
  today: string,
  fiberSource: FiberSource | null,
): Eaten {
  const todays = log.filter((e) => e.date === today);
  const totals = totalOf(todays);
  const fiberG = fiberSource ? fiberOfEntries(todays, fiberSource).fiberG : 0;
  return { kcal: totals.kcal, proteinG: totals.proteinG, fiberG };
}

/**
 * Lägesraden. Lågt läge: `LOW_TEXT`. Annars nämns protein eller fiber när de ligger klart efter
 * kalorierna (mer än 15 procentenheter och under 90 % av målet) – men inte från klockan 20.
 */
export function statusText(eaten: Eaten, goals: Goals, remaining: Remaining, hour: number): string {
  if (isLowMode(remaining)) return LOW_TEXT;
  if (remaining.kcal === null) return 'Förslag utifrån det du brukar äta.';
  const left = `${formatKcal(Math.max(0, remaining.kcal))} kvar`;
  const pK = progress(eaten.kcal, goals.targetKcal) ?? 0;
  const lagging: string[] = [];
  if (hour < LATE_HOUR) {
    const pP = progress(eaten.proteinG, goals.proteinGoalG);
    const pF = progress(eaten.fiberG, goals.fiberGoalG);
    if (pP !== null && pP < 0.9 && pP < pK - 0.15) lagging.push('protein');
    if (pF !== null && pF < 0.9 && pF < pK - 0.15) lagging.push('fiber');
  }
  if (lagging.length > 0) return `Lite lågt på ${lagging.join(' och ')} idag · ${left}`;
  return `Du ligger bra till idag · ${left}`;
}

/**
 * Förslagets etiketter. En kombination får de som någon del har (proteinrik kvarg + fiberrika
 * bär), utom Energisnål som bara gäller om alla delar är energisnåla.
 */
export function claimsOfParts(
  parts: readonly SuggestionPart[],
  fiberSource: FiberSource | null,
): ClaimId[] {
  const all = parts.map((p) => claimsFor(p.food, fiberSource ?? NO_FIBER));
  if (all.length === 1) return all[0] ?? [];
  return [...new Set(all.flat())].filter(
    (c) => c !== 'energisnal' || all.every((l) => l.includes(c)),
  );
}

function nameOf(parts: readonly SuggestionPart[]): string {
  return parts.map((p) => p.food.name).join(' + ');
}

/**
 * Förslagen för en måltid, rangordnade. I lågt läge bara energisnåla alternativ; annars aldrig
 * något som går över det som är kvar av dagens kcal-mål. Ett livsmedel ingår i högst en
 * kombination, så att listan blir varierad.
 */
export function buildSuggestions(input: SuggestInput): SuggestResult {
  const eaten = eatenToday(input.log, input.today, input.fiberSource);
  const remaining = remainingOf(eaten, input.goals);
  const low = isLowMode(remaining);
  const typicalKcal = typicalSlotKcal(input.log, input.slot, input.today, input.goals.targetKcal);
  const cap = portionCap(typicalKcal, remaining);
  const ctx: ScoreContext = { eaten, goals: input.goals, remaining, cap, low };
  const hiddenKeys = new Set((input.hidden ?? []).map((h) => h.key));

  let singles = candidatesFor({ ...input, lowEnergyOnly: low });
  if (low) {
    singles = singles.filter((c) =>
      c.parts.every((p) => claimsFor(p.food, input.fiberSource).includes('energisnal')),
    );
  }
  const combos = low
    ? []
    : combinations(singles, input.log, input.slot, input.today, input.fiberSource, hiddenKeys);

  const scored: Suggestion[] = [];
  for (const c of [...singles, ...combos]) {
    const before = valuesOf(c.parts, input.fiberSource);
    const parts = fitPortion(c.parts, before.kcal, cap);
    const values = valuesOf(parts, input.fiberSource);
    if (!low && remaining.kcal !== null && values.kcal > remaining.kcal) continue;
    scored.push({
      ...c,
      parts,
      name: nameOf(parts),
      values,
      claims: claimsOfParts(parts, input.fiberSource),
      score: scoreCandidate(c.weight, values, ctx),
    });
  }
  scored.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  const inCombo = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const s of scored) {
    if (s.parts.length > 1) {
      const ids = s.parts.map((p) => p.food.id);
      if (ids.some((id) => inCombo.has(id))) continue;
      for (const id of ids) inCombo.add(id);
    }
    suggestions.push(s);
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  return {
    mode: suggestions.length === 0 ? 'empty' : low ? 'low' : 'normal',
    status: statusText(eaten, input.goals, remaining, input.hour),
    eaten,
    remaining,
    typicalKcal,
    cap,
    suggestions,
  };
}

// ---------------------------------------------------------------------------
// Texter

/** "1,5 dl (165 g)" eller "Kvarg 1,5 dl + Blåbär 1 dl" för en kombination. */
export function amountText(parts: readonly SuggestionPart[]): string {
  const text = (p: SuggestionPart) => {
    const entry = { amount: p.amount, unit: p.unit, grams: p.grams };
    return p.food.per100Unit === 'ml'
      ? loggedAmountText({ ...entry, per100Unit: 'ml' })
      : loggedAmountText(entry);
  };
  if (parts.length === 1) return parts[0] ? text(parts[0]) : '';
  return parts.map((p) => `${firstWords(p.food.name)} ${text(p)}`).join(' + ');
}

/** Namnets början (före första kommatecken, högst tre ord) – för korta rader. */
export function firstWords(name: string): string {
  const head = name.split(',')[0] ?? name;
  return head.split(' ').slice(0, 3).join(' ');
}

/**
 * Effekten: "+28 g protein · +3 g fiber · 268 kcal kvar efteråt". Protein och fiber visas när
 * de är minst 1 g; utan kalorimål (eller i lågt läge) ingen rad om vad som är kvar.
 */
export function effectText(values: Values, remaining: Remaining, low: boolean): string {
  const parts: string[] = [];
  if (values.proteinG >= 1) parts.push(`+${formatInt(Math.round(values.proteinG))} g protein`);
  if (values.fiberG !== null && values.fiberG >= 1) {
    parts.push(`+${formatInt(Math.round(values.fiberG))} g fiber`);
  }
  if (!low && remaining.kcal !== null) {
    parts.push(`${formatKcal(Math.max(0, remaining.kcal - values.kcal))} kvar efteråt`);
  }
  return parts.join(' · ');
}

/** Rubriken i sheeten: "Förslag till mellanmål". */
export function suggestTitle(slot: MealSlot): string {
  return `Förslag till ${mealLabel(slot).toLowerCase()}`;
}

/**
 * De vanligaste livsmedlen de senaste 28 dagarna ("brukar finnas hemma") för AI-prompten:
 * livsmedel (inte måltider, recept eller snabbloggar), flest loggar först, högst `limit`.
 */
export function commonFoods(log: readonly FoodLogEntry[], today: string, limit = 15): string[] {
  const counts = new Map<string, { name: string; n: number; last: number }>();
  for (const e of recentEntries(log, today)) {
    if (/^(maltid|recept):/.test(e.foodId)) continue;
    const prev = counts.get(e.foodId);
    counts.set(e.foodId, {
      name: e.name,
      n: (prev?.n ?? 0) + 1,
      last: Math.max(prev?.last ?? 0, e.createdAt),
    });
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || b.last - a.last)
    .slice(0, limit)
    .map((c) => c.name);
}

/** Loggposter för ett förslag (en per del) i vald måltid. */
export function suggestionEntries(
  suggestion: Pick<Suggestion, 'parts'>,
  slot: MealSlot,
  date: string,
  newId: () => string,
  now: number = Date.now(),
): FoodLogEntry[] {
  return suggestion.parts.map((p, i) => {
    const entry: FoodLogEntry = {
      id: newId(),
      date,
      meal: slot,
      foodId: p.food.id,
      name: p.food.name,
      amount: p.amount,
      unit: p.unit,
      grams: p.grams,
      per100: p.food.per100,
      createdAt: now + i,
    };
    if (p.food.per100Unit === 'ml') entry.per100Unit = 'ml';
    if (p.food.recipe) entry.recipe = p.food.recipe;
    return entry;
  });
}
