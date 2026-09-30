/**
 * "Föreslå" i Mat: förslag på vad man kan äta i en måltid utifrån dagens största näringsgap
 * (protein, fiber), det som är kvar av kalorierna och det man brukar äta. Helt lokalt – rena
 * funktioner utan I/O.
 *
 * - **Gap**: proteingapet = max(0, proteinmål − intag), fibergapet likadant mot veckans fibermål.
 *   Ett gap är "stort" när mer än 10 % av målet återstår (`GAP_SMALL_SHARE`).
 * - **Kandidater**: livsmedel loggade de senaste 28 dagarna, favoriter, egna måltider och
 *   recept. Mängden är användarens typiska (median av loggar där livsmedlet var en huvudkomponent),
 *   annars standardportionen. Har måltiden färre än 5 egna kandidater fylls det på med startlistan
 *   (`src/data/suggestions.ts`), med en vikt som minskar när historiken växer.
 * - **Portioner**: proteinkällor (≥ 20 % energi från protein) skalas inom 0,5–2 × portionen för att
 *   fylla proteingapet så långt kalorierna räcker. Ingen portion under kategorins minsta rimliga
 *   (kött/fisk 75 g, ägg 1 st, kvarg/yoghurt 1 dl …).
 * - **Poäng** (stort gap): näringspoängen (andel av gapen som fylls, viktad efter hur mycket av
 *   respektive mål som återstår) står för minst 70 %, vanan för högst 20 % och lätthet för resten.
 *   Straff för att gå över det som är kvar och över måltidens typiska kcal. Små gap: lätthet + vana.
 * - **Kombinationer**: en protein- eller fiberkälla + något användaren brukar äta till den.
 *   Etiketterna räknas på kombinationens totala näring.
 * - **Variation**: ett livsmedel förekommer i högst ett av de tre förslag som visas samtidigt.
 * - **Lågt läge**: under 150 kcal kvar (eller över målet) föreslås bara energisnåla alternativ,
 *   med en saklig rad – aldrig uppmaningar att äta för att nå protein- eller fibermål.
 */
import type { FoodCategory } from '../data/foodCategories.ts';
import { PROTEIN_KCAL_PER_G, type ClaimId } from '../data/nutritionClaims.ts';
import { START_SUGGESTIONS, type StartSuggestion } from '../data/suggestions.ts';
import type { Favorite, FoodLogEntry } from '../db/db.ts';
import { claimsFor, nutritionClaims } from './claims.ts';
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
 * använts oftast (vid lika: den senaste). `null` utan loggar. Skicka bara loggar där livsmedlet
 * var en huvudkomponent (`mainComponentEntries`).
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

/** Andel av måltidens kcal som gör en post till en huvudkomponent. */
export const MAIN_COMPONENT_SHARE = 0.25;

function entryKcal(e: Pick<FoodLogEntry, 'per100' | 'grams'>): number {
  return scaleNutrients(e.per100, e.grams).kcal;
}

function mealKey(e: Pick<FoodLogEntry, 'date' | 'meal'>): string {
  return `${e.date}|${e.meal}`;
}

/**
 * Var posten en huvudkomponent i sin måltid? Ja i en måltid med högst två poster, när den är
 * måltidens största post eller står för minst 25 % av måltidens kcal. 15 g kyckling i en sallad
 * med sex poster är det inte – den ska inte bli "typisk mängd".
 */
export function isMainComponent(
  entry: Pick<FoodLogEntry, 'id' | 'per100' | 'grams'>,
  meal: readonly Pick<FoodLogEntry, 'id' | 'per100' | 'grams'>[],
): boolean {
  if (meal.length <= 2) return true;
  const kcal = meal.map(entryKcal);
  const total = kcal.reduce((a, b) => a + b, 0);
  const mine = entryKcal(entry);
  if (!(total > 0)) return true;
  return mine >= MAIN_COMPONENT_SHARE * total || mine >= Math.max(...kcal);
}

/** Loggarna (av `entries`) där livsmedlet var en huvudkomponent i måltiden (ur hela `log`). */
export function mainComponentEntries<T extends FoodLogEntry>(
  entries: readonly T[],
  log: readonly FoodLogEntry[],
): T[] {
  const meals = new Map<string, FoodLogEntry[]>();
  const keys = new Set(entries.map(mealKey));
  for (const e of log) {
    const key = mealKey(e);
    if (!keys.has(key)) continue;
    const list = meals.get(key) ?? [];
    list.push(e);
    meals.set(key, list);
  }
  return entries.filter((e) => isMainComponent(e, meals.get(mealKey(e)) ?? [e]));
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
  /** Antal loggar i måltiden de senaste 28 dagarna (för förklaringen "Du brukar …"). */
  inSlot: number;
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

  function add(
    food: FoodItem,
    amount: Amount,
    weight: number,
    origin: Origin,
    general: boolean,
    inSlot = 0,
  ) {
    if (hiddenKeys.has(food.id) || loggedNow.has(food.id) || result.has(food.id)) return;
    if (!worthSuggesting(food, amount)) return;
    const w = weight * dislikeFactor(food, hidden);
    result.set(food.id, {
      key: food.id,
      parts: [{ food, ...amount }],
      weight: w,
      origin,
      general,
      inSlot,
    });
  }

  for (const s of stats.values()) {
    const last = s.entries[s.entries.length - 1];
    if (!last) continue;
    const food = catalog.get(s.foodId) ?? entryToItem(last);
    // Typisk mängd bara ur loggar där livsmedlet var en huvudkomponent.
    const amount =
      typicalAmount(mainComponentEntries(s.entries, log)) ?? standardAmount(food, custom(food.id));
    const favorite = favoriteIds.has(s.foodId) ? FAVORITE_BONUS : 0;
    const weight = OWN_BONUS + historyWeight(s, slot, today) + favorite;
    add(food, amount, weight, 'history', false, s.slots[slot]);
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
// Etiketter och näring

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
 * Förslagets etiketter. Ett livsmedel: dess egna. En kombination räknas på den totala näringen
 * (kcal, protein och känd fiber per 100 g av hela kombinationen) – aldrig ärvda från delarna:
 * cappuccino + äpple är inte Proteinrik bara för att mjölken är det. Saknar någon del fiberdata
 * är fibern i underkant, och Fiberrik ges bara om den ändå når gränsen.
 */
export function claimsOfParts(
  parts: readonly SuggestionPart[],
  fiberSource: FiberSource | null,
): ClaimId[] {
  const [only] = parts;
  if (parts.length === 1 && only) return claimsFor(only.food, fiberSource ?? NO_FIBER);
  const grams = parts.reduce((s, p) => s + p.grams, 0);
  if (!(grams > 0) || parts.some((p) => p.food.source === 'snabb')) return [];
  const v = valuesOf(parts, fiberSource);
  const per100 = (x: number) => (x / grams) * 100;
  return nutritionClaims({
    kcal: per100(v.kcal),
    proteinG: per100(v.proteinG),
    fiberG: v.fiberG === null ? null : per100(v.fiberG),
    liquid: parts.every((p) => p.food.per100Unit === 'ml' || isLiquid(p.food)),
  });
}

function isLiquid(food: FoodItem): boolean {
  const category = foodProfile(food).category;
  return category === 'dryck' || category === 'mjolk';
}

/** En proteinkälla ger minst så här mycket protein per 100 g (gurka är "Proteinrik" men ingen källa). */
export const PROTEIN_SOURCE_MIN_G = 5;

/**
 * Proteinkälla: minst 20 % av energin från protein (samma regel som etiketten Proteinrik) och
 * minst 5 g protein per 100 g.
 */
export function isProteinSource(food: FoodItem, fiberSource: FiberSource | null): boolean {
  return (
    food.per100.proteinG >= PROTEIN_SOURCE_MIN_G &&
    claimsFor(food, fiberSource ?? NO_FIBER).includes('proteinrik')
  );
}

// ---------------------------------------------------------------------------
// Gap

/** Ett gap är litet när högst så stor andel av målet återstår. */
export const GAP_SMALL_SHARE = 0.1;

export interface Gap {
  /** Gram kvar till målet, aldrig negativt. */
  grams: number;
  /** Andel av målet som återstår, 0–1 (0 utan mål). */
  share: number;
}

export interface Gaps {
  protein: Gap;
  fiber: Gap;
}

function gapOf(eaten: number, goal: number | null): Gap {
  if (goal === null || !(goal > 0)) return { grams: 0, share: 0 };
  const grams = Math.max(0, goal - eaten);
  return { grams, share: Math.min(1, grams / goal) };
}

/** Dagens gap: proteingapet mot proteinmålet, fibergapet mot (veckans) fibermål. */
export function gapsOf(eaten: Eaten, goals: Goals): Gaps {
  return {
    protein: gapOf(eaten.proteinG, goals.proteinGoalG),
    fiber: gapOf(eaten.fiberG, goals.fiberGoalG),
  };
}

/** Något gap är större än 10 % av sitt mål. */
export function hasLargeGap(gaps: Gaps): boolean {
  return gaps.protein.share > GAP_SMALL_SHARE || gaps.fiber.share > GAP_SMALL_SHARE;
}

/**
 * Vikterna för protein och fiber: proportionella mot andelen av respektive mål som återstår.
 * Ett litet gap (högst 10 % kvar) räknas som nått och får vikten 0 när det andra är stort.
 */
export function gapWeights(gaps: Gaps): { protein: number; fiber: number } {
  const large = hasLargeGap(gaps);
  const share = (g: Gap) => (large && g.share <= GAP_SMALL_SHARE ? 0 : g.share);
  const p = share(gaps.protein);
  const f = share(gaps.fiber);
  if (!(p + f > 0)) return { protein: 0, fiber: 0 };
  return { protein: p / (p + f), fiber: f / (p + f) };
}

/** Hur stor del av gapet förslaget fyller, 0–1 (0 utan gap). */
function fill(gain: number, gap: Gap): number {
  return gap.grams > 0 ? Math.min(Math.max(0, gain), gap.grams) / gap.grams : 0;
}

/**
 * Näringspoängen, 0–1: wP × min(protein, proteingap)/proteingap + wF × min(fiber, fibergap)/fibergap,
 * där vikterna är proportionella mot hur stor andel av respektive mål som återstår.
 */
export function nutritionScore(values: Values, gaps: Gaps): number {
  const w = gapWeights(gaps);
  return (
    w.protein * fill(values.proteinG, gaps.protein) + w.fiber * fill(values.fiberG ?? 0, gaps.fiber)
  );
}

// ---------------------------------------------------------------------------
// Portioner

/** Portionstaket: måltidens typiska kcal, men aldrig mer än det som är kvar (lågt läge: 100 kcal). */
export function portionCap(typicalKcal: number, remaining: Remaining): number {
  if (isLowMode(remaining)) return 100;
  const left = remaining.kcal ?? Infinity;
  return Math.max(50, Math.min(typicalKcal, left));
}

/**
 * Minsta rimliga portion per kategori i gram (ungefärliga): kött och fisk 75 g, ägg 1 st (≈ 50 g),
 * kvarg/yoghurt/fil 1 dl (≈ 100 g) … så att förslag som "15 g kyckling" aldrig visas.
 */
export const MIN_PORTION_G: Readonly<Partial<Record<FoodCategory, number>>> = {
  kott: 75,
  fisk: 75,
  korv: 50,
  agg: 50,
  fil: 100,
  ost: 20,
  palagg: 20,
};

/** Kategorins minsta rimliga portion i gram (`null` = ingen gräns). */
export function minPortionGrams(food: FoodItem): number | null {
  if (/^(maltid|recept):/.test(food.id)) return null;
  return MIN_PORTION_G[foodProfile(food).category] ?? null;
}

/** Styck räknas i hela (3 ägg, inte 3,5), andra enheter i halvor. */
function unitStep(unit: string): number {
  return unit === 'st' ? 1 : 0.5;
}

function perUnitOf(part: SuggestionPart): number {
  return part.amount > 0 ? part.grams / part.amount : part.grams;
}

/** Delen med en ny vikt: gram i steg om 5 g, enheter i halvor (`floor` = aldrig uppåt). */
function withGrams(part: SuggestionPart, grams: number, floor = false): SuggestionPart {
  if (part.unit === GRAM) {
    const g = floor && grams >= 20 ? Math.max(5, Math.floor(grams / 5) * 5) : roundGrams(grams);
    return { ...part, amount: g, grams: g };
  }
  const perUnit = perUnitOf(part);
  const step = unitStep(part.unit);
  const steps = grams / perUnit / step;
  const amount = Math.max(step, (floor ? Math.floor(steps) : Math.round(steps)) * step);
  return { ...part, amount, grams: round1(amount * perUnit) };
}

/** Höjer en för liten portion till kategorins minsta (ägg: 1 st, kvarg: 1 dl, kyckling: 75 g). */
export function atLeastMinPortion(part: SuggestionPart): SuggestionPart {
  const min = minPortionGrams(part.food);
  if (min === null || part.grams >= min) return part;
  if (part.unit === GRAM) {
    const g = Math.ceil(min / 5) * 5;
    return { ...part, amount: g, grams: g };
  }
  const perUnit = perUnitOf(part);
  const step = unitStep(part.unit);
  const amount = Math.max(step, Math.ceil(min / perUnit / step - 1e-9) * step);
  return { ...part, amount, grams: round1(amount * perUnit) };
}

/**
 * Proteinkällans portion: så mycket som fyller proteingapet, inom 0,5–2 × portionen och så långt
 * `kcalLimit` räcker – men aldrig under kategorins minsta rimliga portion.
 */
export function scaleProteinPortion(
  part: SuggestionPart,
  proteinGapG: number,
  kcalLimit: number,
): SuggestionPart {
  const { kcal, proteinG } = part.food.per100;
  if (!(proteinG > 0) || !(part.grams > 0) || !(proteinGapG > 0)) return atLeastMinPortion(part);
  const lo = part.grams * 0.5;
  const hi = part.grams * 2;
  const wanted = Math.min(hi, Math.max(lo, (proteinGapG / proteinG) * 100));
  const allowed = kcal > 0 ? (kcalLimit / kcal) * 100 : Infinity;
  const grams = Math.max(lo, Math.min(wanted, allowed));
  const limited = allowed < wanted;
  const scaled = Math.abs(grams - part.grams) < 1e-9 ? part : withGrams(part, grams, limited);
  return atLeastMinPortion(scaled);
}

/**
 * Skalar ner en kandidat som är mycket större än portionstaket (mer än 25 % över) så att den
 * ryms: gram i steg om 5 g, enheter i halvor. Aldrig under hälften av mängden eller under
 * kategorins minsta rimliga portion.
 */
export function fitPortion(
  parts: readonly SuggestionPart[],
  kcal: number,
  cap: number,
): SuggestionPart[] {
  if (!(kcal > cap * 1.25) || !(kcal > 0)) return parts.map(atLeastMinPortion);
  const factor = Math.max(0.5, cap / kcal);
  return parts.map((p) => {
    if (p.unit === GRAM) {
      const g = roundGrams(p.grams * factor);
      return atLeastMinPortion({ ...p, amount: g, grams: g });
    }
    const perUnit = perUnitOf(p);
    const amount = Math.max(roundCount(p.amount * factor), p.amount >= 1 ? 0.5 : p.amount);
    return atLeastMinPortion({ ...p, amount, grams: round1(amount * perUnit) });
  });
}

// ---------------------------------------------------------------------------
// Poäng

export type ScoreMode = 'gap' | 'small' | 'low';

export interface ScoreContext {
  mode: ScoreMode;
  gaps: Gaps;
  /** Den högsta näringspoängen bland kandidaterna (näringen normeras mot den). */
  bestNutrition: number;
  remaining: Remaining;
  /** Måltidens typiska kcal. */
  typicalKcal: number;
}

/** Näringens minsta andel av totalpoängen när något gap är stort. */
export const NUTRITION_MIN_SHARE = 0.7;
/** Vanans största andel av totalpoängen. */
export const HABIT_MAX_SHARE = 0.2;

/** Näringens vikt när något gap är stort. */
export const NUTRITION_WEIGHT = 0.7;
/** Vanans vikt. */
export const HABIT_WEIGHT = 0.2;
/** Lätthetens vikt med stora gap. */
export const LIGHT_WEIGHT = 0.1;

/** Vanan 0–1: hur ofta, nyligen och i vilken måltid (kandidatens vikt, mättad vid 1). */
export function habitScore(weight: number): number {
  return Math.min(1, Math.max(0, weight));
}

/**
 * Lätthet 0–1 ur energitätheten: 1 vid ≤ 40 kcal/100 g (Energisnål), 0 vid ≥ 400 kcal/100 g.
 */
export function lightScore(kcal: number, grams: number): number {
  if (!(grams > 0)) return 0;
  const density = (kcal / grams) * 100;
  return Math.min(1, Math.max(0, (400 - density) / 360));
}

export interface ScoreParts {
  nutrition: number;
  habit: number;
  light: number;
  penalty: number;
  total: number;
}

/**
 * Poängens delar med stora gap. `nutrition` är näringspoängen normerad mot dagens bästa kandidat
 * (0–1), `habit` och `light` 0–1. Vikterna är 0,7 / 0,2 / 0,1, och för varje förslag kapas vanan
 * och lättheten så att näringen står för minst 70 % och vanan för högst 20 % av totalpoängen: ett
 * förslag som inte fyller något gap lyfts inte av att man brukar äta det.
 */
export function gapScoreParts(
  nutrition: number,
  habit: number,
  light: number,
): Omit<ScoreParts, 'penalty' | 'total'> {
  const n = NUTRITION_WEIGHT * Math.min(1, Math.max(0, nutrition));
  // h + l ≤ 3/7 × n ⇔ näringen ≥ 70 %; h ≤ 1/4 × (n + l) ⇔ vanan ≤ 20 %.
  const rest = (n * (1 - NUTRITION_MIN_SHARE)) / NUTRITION_MIN_SHARE;
  const l = Math.min(LIGHT_WEIGHT * Math.max(0, light), rest / 3);
  const h = Math.min(
    HABIT_WEIGHT * Math.max(0, habit),
    ((n + l) * HABIT_MAX_SHARE) / (1 - HABIT_MAX_SHARE),
    rest - l,
  );
  return { nutrition: n, habit: Math.max(0, h), light: l };
}

/**
 * Straff för en portion över måltidens typiska kcal (mer än 10 % över). För små portioner straffas
 * inte – de höjs i stället till kategorins minsta rimliga portion.
 */
export function portionPenalty(kcal: number, typicalKcal: number): number {
  if (!(typicalKcal > 0)) return 0;
  const ratio = kcal / typicalKcal;
  return ratio > 1.1 ? (ratio - 1.1) * 0.8 : 0;
}

/** Straff för att gå över det som är kvar av dagens kcal (eller komma mycket nära). */
export function overBudgetPenalty(kcal: number, remainingKcal: number | null): number {
  if (remainingKcal === null) return 0;
  if (kcal > remainingKcal) return 1 + (kcal - remainingKcal) / 100;
  if (remainingKcal > 0 && kcal > remainingKcal * 0.9) return 0.05;
  return 0;
}

/**
 * Förslagets poäng. Stort gap: näringen (vikt 0,7, normerad mot bästa kandidaten, minst 70 %) +
 * vana (högst 20 %) + lätthet − straff.
 * Små gap och lågt läge: lätthet + vana − straff (som tidigare: energisnålt och det man brukar).
 */
export function scoreCandidate(
  weight: number,
  values: Values,
  grams: number,
  ctx: ScoreContext,
): ScoreParts {
  const habit = habitScore(weight);
  const light = lightScore(values.kcal, grams);
  const penalty =
    ctx.mode === 'low'
      ? 0
      : portionPenalty(values.kcal, ctx.typicalKcal) +
        overBudgetPenalty(values.kcal, ctx.remaining.kcal);
  if (ctx.mode === 'gap') {
    const best = ctx.bestNutrition > 0 ? ctx.bestNutrition : 1;
    const parts = gapScoreParts(nutritionScore(values, ctx.gaps) / best, habit, light);
    return { ...parts, penalty, total: parts.nutrition + parts.habit + parts.light - penalty };
  }
  const h = 0.5 * habit;
  const l = 0.5 * light;
  return { nutrition: 0, habit: h, light: l, penalty, total: h + l - penalty };
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

function comboOf(a: Candidate, b: Candidate, weight: number, inSlot: number): Candidate {
  const [first, second] = a.key < b.key ? [a, b] : [b, a];
  return {
    key: `${first.key}+${second.key}`,
    parts: [...first.parts, ...second.parts],
    weight,
    origin: a.origin === 'start' && b.origin === 'start' ? 'start' : 'history',
    general: a.general || b.general,
    inSlot,
  };
}

/** Vilka källor som behövs: ett stort protein- respektive fibergap (små gap: båda). */
export interface Needs {
  protein: boolean;
  fiber: boolean;
}

/**
 * Kombinationer som kompletterar: en protein- eller fiberkälla (etiketten Proteinrik/Fiberrik)
 * + något användaren brukar äta till den – loggat ihop i måltiden minst två gånger, eller en
 * proteinkälla och en fiberkälla där minst den ena är användarens egen (loggad i måltiden).
 * Källan ska fylla ett stort gap (`needs`): med bara fibergap blir kvarg + äpple ingen kombination.
 * Två livsmedel ur samma kategori (två sorters bär) blir ingen kombination. Högst `limit` stycken.
 */
export function combinations(
  candidates: readonly Candidate[],
  log: readonly FoodLogEntry[],
  slot: MealSlot,
  today: string,
  fiberSource: FiberSource | null,
  hiddenKeys: ReadonlySet<string> = new Set(),
  needs: Needs = { protein: true, fiber: true },
  limit = 6,
): Candidate[] {
  const single = candidates.filter((c) => c.parts.length === 1);
  const byId = new Map(single.map((c) => [c.key, c]));
  const claims = new Map(single.map((c) => [c.key, claimsOfParts(c.parts, fiberSource)]));
  const isSource = (c: Candidate) => {
    const list = claims.get(c.key) ?? [];
    return (
      (needs.protein && list.includes('proteinrik')) || (needs.fiber && list.includes('fiberrik'))
    );
  };
  const category = (c: Candidate) => {
    const f = c.parts[0]?.food;
    return f ? foodProfile(f).category : 'ovrigt';
  };
  const result = new Map<string, Candidate>();
  const put = (combo: Candidate) => {
    if (!hiddenKeys.has(combo.key) && !result.has(combo.key)) result.set(combo.key, combo);
  };

  // Något användaren brukar äta till källan: loggat ihop i måltiden minst två gånger.
  for (const [key, count] of coLogged(log, slot, today)) {
    if (count < 2) continue;
    const [a, b] = keyFoods(key).map((id) => byId.get(id));
    if (!a || !b || (!isSource(a) && !isSource(b))) continue;
    if (category(a) === category(b) && category(a) !== 'ovrigt') continue;
    // En kombination är lika mycket vana som sin minst vanliga del, plus att de äts ihop.
    put(comboOf(a, b, Math.min(a.weight, b.weight) + 0.05 * Math.min(count, 5), count));
  }

  // Protein + fiber där minst den ena är användarens egen i måltiden (kvarg + bär).
  const has = (c: Candidate, id: ClaimId) => (claims.get(c.key) ?? []).includes(id);
  const top = [...single].sort((x, y) => y.weight - x.weight).slice(0, 8);
  for (const p of needs.protein && needs.fiber ? top : []) {
    if (!has(p, 'proteinrik') || has(p, 'fiberrik')) continue;
    for (const f of top) {
      if (f === p || !has(f, 'fiberrik') || has(f, 'proteinrik')) continue;
      if (p.inSlot === 0 && f.inSlot === 0) continue;
      if (category(p) === category(f)) continue;
      put(comboOf(p, f, ((p.weight + f.weight) / 2) * 0.85, Math.min(p.inSlot, f.inSlot)));
    }
  }
  return [...result.values()].sort((x, y) => y.weight - x.weight).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Förslagen

export interface Suggestion extends Candidate {
  /** "Kvarg naturell" eller "Kvarg naturell + Blåbär". */
  name: string;
  values: Values & Nutrients;
  claims: ClaimId[];
  score: number;
  /** Poängens delar (för tester och felsökning). */
  scoreParts: ScoreParts;
  /** Kort förklaring: "Mycket protein per kcal", "Fyller fibergapet" … */
  reason: string;
}

export interface SuggestInput extends CandidateInput {
  hour: number;
  goals: Goals;
  fiberSource: FiberSource | null;
}

export type SuggestMode = 'normal' | 'low' | 'empty';

export interface SuggestResult {
  mode: SuggestMode;
  /** Lägesraden överst, t.ex. "41 g protein och 6 g fiber kvar · 302 kcal kvar". */
  status: string;
  eaten: Eaten;
  remaining: Remaining;
  gaps: Gaps;
  /** Rangordnat efter näringsgap (stort gap) eller lätthet + vana (små gap, lågt läge). */
  scoreMode: ScoreMode;
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
 * Lägesraden, byggd på dagens största gap: "41 g protein och 6 g fiber kvar · 302 kcal kvar"
 * (gap över 10 % av målet, störst andel först). "Du ligger bra till idag" bara när både protein
 * och fiber är inom 10 % av målet. Lågt läge: `LOW_TEXT`. Från klockan 20 nämns aldrig protein
 * eller fiber.
 */
export function statusText(eaten: Eaten, goals: Goals, remaining: Remaining, hour: number): string {
  if (isLowMode(remaining)) return LOW_TEXT;
  const left = remaining.kcal === null ? null : `${formatKcal(Math.max(0, remaining.kcal))} kvar`;
  const gaps = gapsOf(eaten, goals);
  const large = [
    { label: 'protein', gap: gaps.protein },
    { label: 'fiber', gap: gaps.fiber },
  ]
    .filter((g) => g.gap.share > GAP_SMALL_SHARE)
    .sort((a, b) => b.gap.share - a.gap.share);
  if (large.length === 0) {
    return left === null
      ? 'Förslag utifrån det du brukar äta.'
      : `Du ligger bra till idag · ${left}`;
  }
  if (hour >= LATE_HOUR)
    return left === null ? 'Förslag utifrån det du brukar äta.' : `${left} idag`;
  const text = `${large.map((g) => `${formatInt(Math.round(g.gap.grams))} g ${g.label}`).join(' och ')} kvar`;
  return left === null ? text : `${text} · ${left}`;
}

function nameOf(parts: readonly SuggestionPart[]): string {
  return parts.map((p) => p.food.name).join(' + ');
}

function gramsOf(parts: readonly SuggestionPart[]): number {
  return parts.reduce((s, p) => s + p.grams, 0);
}

/** Andel av gapet – eller gram – som räknas som ett bidrag värt att nämna i förklaringen. */
const REASON_MIN_FILL = 0.15;
const REASON_MIN_PROTEIN_G = 10;
const REASON_MIN_FIBER_G = 3;
/** … och bara för en källa: minst 15 % av energin från protein, minst 1,5 g fiber per 100 kcal. */
const REASON_MIN_PROTEIN_SHARE = 0.15;
const REASON_MIN_FIBER_PER_100_KCAL = 1.5;

/**
 * Förklaringen, en kort rad: varför förslaget står där. Stort gap: protein ("Mycket protein per
 * kcal" när ≥ 30 % av energin är protein, annars "Fyller proteingapet") eller fiber ("Mycket fiber
 * per kcal" vid ≥ 3 g/100 kcal, annars "Fyller fibergapet"). Annars lätthet eller vana. Från
 * klockan 20 nämns inte protein eller fiber.
 */
export function reasonFor(
  s: Pick<Suggestion, 'values' | 'claims' | 'origin' | 'general' | 'inSlot' | 'parts'>,
  ctx: { mode: ScoreMode; gaps: Gaps; slot: MealSlot; late: boolean },
): string {
  const { values } = s;
  if (ctx.mode === 'gap' && !ctx.late) {
    const w = gapWeights(ctx.gaps);
    const p = fill(values.proteinG, ctx.gaps.protein);
    const f = fill(values.fiberG ?? 0, ctx.gaps.fiber);
    const proteinShare = values.kcal > 0 ? (values.proteinG * PROTEIN_KCAL_PER_G) / values.kcal : 0;
    const fiberPer100kcal = values.kcal > 0 ? ((values.fiberG ?? 0) / values.kcal) * 100 : 0;
    // Bara när förslaget faktiskt är en källa: en kanelbulle "fyller" inte proteingapet.
    const pOk =
      w.protein > 0 &&
      proteinShare >= REASON_MIN_PROTEIN_SHARE &&
      (p >= REASON_MIN_FILL || values.proteinG >= REASON_MIN_PROTEIN_G);
    const fOk =
      w.fiber > 0 &&
      fiberPer100kcal >= REASON_MIN_FIBER_PER_100_KCAL &&
      (f >= REASON_MIN_FILL || (values.fiberG ?? 0) >= REASON_MIN_FIBER_G);
    if (pOk && fOk) return 'Fyller både protein- och fibergapet';
    if (pOk && (!fOk || w.protein * p >= w.fiber * f)) {
      return proteinShare >= 0.3 ? 'Mycket protein per kcal' : 'Fyller proteingapet';
    }
    if (fOk) {
      return fiberPer100kcal >= 3 ? 'Mycket fiber per kcal' : 'Fyller fibergapet';
    }
  }
  if (s.claims.includes('energisnal')) return 'Energisnålt – lätt att få plats med';
  const slotName = mealLabel(ctx.slot).toLowerCase();
  if (s.inSlot >= 2) return `Du brukar äta det till ${slotName}`;
  const [only] = s.parts;
  if (s.origin === 'dish' && only) {
    return only.food.source === 'recept' ? 'Ett av dina recept' : 'En av dina måltider';
  }
  if (s.origin === 'favorite') return 'En av dina favoriter';
  if (s.origin === 'history') return 'Något du ätit nyligen';
  return `Passar till ${slotName}`;
}

/**
 * Variation: ett livsmedel förekommer i högst ett av förslagen på samma sida (tre som visas
 * samtidigt). Ett förslag som krockar flyttas till en senare sida. Kan en sida inte fyllas
 * slutar listan där.
 */
export function diversify<T extends { parts: readonly { food: { id: string } }[] }>(
  ranked: readonly T[],
  page = SUGGESTION_PAGE,
  max = MAX_SUGGESTIONS,
): T[] {
  const rest = [...ranked];
  const out: T[] = [];
  while (rest.length > 0 && out.length < max) {
    const used = new Set<string>();
    let taken = 0;
    for (let i = 0; i < rest.length && taken < page && out.length < max;) {
      const item = rest[i];
      const ids = item ? item.parts.map((p) => p.food.id) : [];
      if (!item || ids.some((id) => used.has(id))) {
        i += 1;
        continue;
      }
      for (const id of ids) used.add(id);
      out.push(item);
      rest.splice(i, 1);
      taken += 1;
    }
    if (taken < page) break;
  }
  return out;
}

/**
 * Förslagen för en måltid, rangordnade. Stort gap: efter näringsgapen (proteinkällor skalas mot
 * proteingapet). Små gap: lätthet + vana. Lågt läge: bara energisnåla alternativ. Aldrig något som
 * går över det som är kvar av dagens kcal-mål. Ett livsmedel ingår i högst en kombination och i
 * högst ett av de tre förslag som visas samtidigt.
 */
export function buildSuggestions(input: SuggestInput): SuggestResult {
  const eaten = eatenToday(input.log, input.today, input.fiberSource);
  const remaining = remainingOf(eaten, input.goals);
  const low = isLowMode(remaining);
  const gaps = gapsOf(eaten, input.goals);
  const gapMode = !low && hasLargeGap(gaps);
  const typicalKcal = typicalSlotKcal(input.log, input.slot, input.today, input.goals.targetKcal);
  const cap = portionCap(typicalKcal, remaining);
  const hiddenKeys = new Set((input.hidden ?? []).map((h) => h.key));
  const late = input.hour >= LATE_HOUR;

  let singles = candidatesFor({ ...input, lowEnergyOnly: low });
  if (low) {
    singles = singles.filter((c) =>
      c.parts.every((p) => claimsFor(p.food, input.fiberSource).includes('energisnal')),
    );
  }
  const combos = low
    ? []
    : combinations(singles, input.log, input.slot, input.today, input.fiberSource, hiddenKeys, {
        protein: !gapMode || gaps.protein.share > GAP_SMALL_SHARE,
        fiber: !gapMode || gaps.fiber.share > GAP_SMALL_SHARE,
      });

  // Portioner och värden först: näringen normeras mot den bästa kandidaten.
  const sized = [...singles, ...combos].flatMap((c) => {
    const [only] = c.parts;
    const protein =
      gapMode &&
      only !== undefined &&
      c.parts.length === 1 &&
      gaps.protein.grams > 0 &&
      isProteinSource(only.food, input.fiberSource);
    const parts = protein
      ? [scaleProteinPortion(only, gaps.protein.grams, cap)]
      : fitPortion(c.parts, valuesOf(c.parts, input.fiberSource).kcal, cap);
    const values = valuesOf(parts, input.fiberSource);
    if (!low && remaining.kcal !== null && values.kcal > remaining.kcal) return [];
    return [{ c, parts, values }];
  });
  const bestNutrition = Math.max(0, ...sized.map((x) => nutritionScore(x.values, gaps)));
  const mode: ScoreMode = gapMode && bestNutrition > 0 ? 'gap' : low ? 'low' : 'small';
  const ctx: ScoreContext = { mode, gaps, bestNutrition, remaining, typicalKcal };

  const scored = sized.map(({ c, parts, values }): Suggestion => {
    const claims = claimsOfParts(parts, input.fiberSource);
    const scoreParts = scoreCandidate(c.weight, values, gramsOf(parts), ctx);
    const suggestion: Suggestion = {
      ...c,
      parts,
      name: nameOf(parts),
      values,
      claims,
      score: scoreParts.total,
      scoreParts,
      reason: '',
    };
    suggestion.reason = reasonFor(suggestion, { mode, gaps, slot: input.slot, late });
    return suggestion;
  });
  scored.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  // Ett livsmedel ingår i högst en kombination.
  const inCombo = new Set<string>();
  const ranked: Suggestion[] = [];
  for (const s of scored) {
    if (s.parts.length > 1) {
      const ids = s.parts.map((p) => p.food.id);
      if (ids.some((id) => inCombo.has(id))) continue;
      for (const id of ids) inCombo.add(id);
    }
    ranked.push(s);
  }
  const suggestions = diversify(ranked);

  return {
    mode: suggestions.length === 0 ? 'empty' : low ? 'low' : 'normal',
    status: statusText(eaten, input.goals, remaining, input.hour),
    eaten,
    remaining,
    gaps,
    scoreMode: mode,
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
