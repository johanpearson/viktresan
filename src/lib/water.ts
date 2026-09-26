/**
 * Dryck: dagsmål, drycker ur matloggen och summor per dag. Rena funktioner utan I/O.
 * (Interna namn heter fortfarande "water"/"vatten" – i gränssnittet heter det Dryck.)
 */
import type { FoodCategory } from '../data/foodCategories.ts';
import type { Sex } from './energy.ts';
import { normalize } from './foodSearch.ts';
import { foodProfile } from './units.ts';

/**
 * Standardmål i ml per kön: dryckesdelen (ca 80 %) av EFSA:s referensvärde för
 * totalt vätskeintag – 2,5 l för män och 2,0 l för kvinnor. Resten kommer från maten.
 */
export const DRINK_GOAL_ML: Readonly<Record<Sex, number>> = { man: 2000, kvinna: 1600 };
/** Kön saknas i profilen: mitt emellan. */
export const DRINK_GOAL_UNKNOWN_SEX_ML = 1800;
/** Tillägg på dagar med ett genomfört pass (valfritt, `waterTrainingBonus`). */
export const TRAINING_BONUS_ML = 500;
/** Snabbknappar: glas, flaska och kopp kaffe/te. */
export const WATER_QUICK_ADD: readonly { ml: number; label: string }[] = [
  { ml: 250, label: 'Glas' },
  { ml: 500, label: 'Flaska' },
  { ml: 150, label: 'Kaffe/te' },
];
/** Gränser för ett eget mål och för en enskild post. */
export const WATER_GOAL_MIN_ML = 500;
export const WATER_GOAL_MAX_ML = 6000;
export const WATER_ENTRY_MAX_ML = 3000;

/** Standardmålet för ett kön (utan koppling till kroppsvikten). */
export function defaultWaterGoalMl(sex: Sex | undefined): number {
  return sex ? DRINK_GOAL_ML[sex] : DRINK_GOAL_UNKNOWN_SEX_ML;
}

export type WaterGoalSource = 'egen' | 'standard';

export interface WaterGoal {
  /** Dagens mål, inklusive ev. träningstillägg. */
  ml: number;
  source: WaterGoalSource;
  /** Målet utan träningstillägg. */
  baseMl: number;
  /** 0 eller `TRAINING_BONUS_ML`. */
  bonusMl: number;
}

export interface WaterGoalProfile {
  sex?: Sex | undefined;
  /** Eget mål. Saknas → standardmålet för könet. */
  waterGoalMl?: number;
  /** +500 ml på dagar med ett genomfört pass. */
  waterTrainingBonus?: boolean;
}

export interface WaterGoalInput {
  profile: WaterGoalProfile | null;
  /** Pass – ett genomfört pass `date` ger träningstillägget (om det är påslaget). */
  workouts?: readonly { date: string; status: string }[];
  /** Dagen målet gäller. Utan datum räknas inget träningstillägg. */
  date?: string;
}

/**
 * Dagens dryckesmål: eget mål i profilen om det finns, annars standardmålet för
 * könet (2 000 / 1 600 ml). Kroppsvikten spelar ingen roll. Det gamla standardmålet
 * (33 ml × trendvikten) sparades aldrig i profilen, så en profil utan eget mål får
 * automatiskt det nya standardmålet; ett eget mål lämnas orört.
 */
export function waterGoal({ profile, workouts = [], date }: WaterGoalInput): WaterGoal {
  const own = profile?.waterGoalMl;
  const baseMl = own ?? defaultWaterGoalMl(profile?.sex);
  const trained =
    profile?.waterTrainingBonus === true &&
    date != null &&
    workouts.some((w) => w.date === date && w.status === 'genomford');
  const bonusMl = trained ? TRAINING_BONUS_ML : 0;
  return { ml: baseMl + bonusMl, source: own == null ? 'standard' : 'egen', baseMl, bonusMl };
}

/** Dagens mål i ml som funktion av datum (för historik och milstolpar). */
export function waterGoalFor(input: Omit<WaterGoalInput, 'date'>): (date: string) => number {
  return (date) => waterGoal({ ...input, date }).ml;
}

// ---------------------------------------------------------------------------
// Drycker ur matloggen

/** Kategorier som räknas som dryck. */
const DRINK_CATEGORIES: ReadonlySet<FoodCategory> = new Set(['dryck', 'mjolk', 'fil']);

/** I kategorierna ovan men äts snarare än dricks, eller koncentrat (normaliserat namn). */
const NOT_A_DRINK = /^(\p{L}*kvarg|keso|cottage|rismal|filbunke|kondenserad)( |$)|\bkonc\b/u;

/** Alkoholhaltiga drycker (normaliserat namn) räknas inte in. */
const ALCOHOL =
  /\bvol\b|(^| )(\p{L}*glogg|\p{L}*cider|(rod|vit|rose|mousserande|bubbel|stark|dessert)?vin|(latt|folk|stark|mellan|export|ljus|mork|vete|pilsner)?ol|pilsner|lager|stout|porter|ipa)( |$)|\b(alkolask|sprit|brannvin|snaps|akvavit|gin|whisky|whiskey|konjak|cognac|likor|punsch|starkvin|rom|vodka|tequila|champagne|cava|prosecco|portvin|sherry|vermouth|mjod|sake|drink|cocktail|hard seltzer)\b/u;
/** Uttryckligen alkoholfritt vinner över `ALCOHOL`. */
const ALCOHOL_FREE = /alkoholfri|saftglogg|\bvol\s*0\b/;

/** Namnet ser ut att vara en alkoholhaltig dryck. */
export function isAlcoholic(name: string): boolean {
  const n = normalize(name);
  return ALCOHOL.test(n) && !ALCOHOL_FREE.test(n);
}

/**
 * En matloggpost. `foodId` och `name` är valfria i typen så att rena näringsposter
 * (`DatedPortion`) går att skicka in – utan namn räknas posten inte som dryck.
 */
export interface DrinkFoodEntry {
  id?: string;
  date: string;
  foodId?: string;
  name?: string;
  /** Gram – eller ml när `per100Unit` är `ml`. */
  grams: number;
  per100Unit?: 'ml';
}

/**
 * Hur många ml dryck en matloggpost är: drycker, mjölk och växtdrycker, fil och
 * yoghurt (inte kvarg, keso …) – aldrig alkohol. Annars `null`.
 */
export function foodDrinkMl(entry: DrinkFoodEntry): number | null {
  const { foodId, name } = entry;
  if (foodId == null || name == null) return null;
  const profile = foodProfile({
    id: foodId,
    name,
    ...(entry.per100Unit ? { per100Unit: entry.per100Unit } : {}),
  });
  if (!DRINK_CATEGORIES.has(profile.category)) return null;
  if (NOT_A_DRINK.test(normalize(name)) || isAlcoholic(name)) return null;
  if (entry.per100Unit === 'ml') return Math.round(entry.grams);
  return Math.round(entry.grams / (profile.density ?? 1));
}

export interface FoodDrink {
  id: string;
  date: string;
  name: string;
  ml: number;
}

/** Matloggposter som räknas som dryck, med mängd i ml. */
export function foodDrinks(foodLog: readonly DrinkFoodEntry[], date?: string): FoodDrink[] {
  const result: FoodDrink[] = [];
  for (const e of foodLog) {
    if (date != null && e.date !== date) continue;
    const ml = foodDrinkMl(e);
    if (ml != null && ml > 0) {
      result.push({ id: e.id ?? '', date: e.date, name: e.name ?? '', ml });
    }
  }
  return result;
}

export interface DatedWater {
  date: string;
  ml: number;
}

/** Dryckesposter (+250 ml osv.) och drycker ur matloggen som en lista. */
export function drinkEntries(
  water: readonly DatedWater[],
  foodLog: readonly DrinkFoodEntry[] = [],
): DatedWater[] {
  return [...water, ...foodDrinks(foodLog)];
}

export interface DrinkDay {
  /** Allt: dryckesposter + drycker ur Mat. */
  ml: number;
  /** Loggat under Dryck. */
  loggedMl: number;
  /** Ur matloggen. */
  foodMl: number;
  food: FoodDrink[];
}

/** En dags dryck, uppdelad på loggat och det som kommer från Mat. */
export function drinkOn(
  water: readonly DatedWater[],
  foodLog: readonly DrinkFoodEntry[],
  date: string,
): DrinkDay {
  const loggedMl = waterOn(water, date);
  const food = foodDrinks(foodLog, date);
  const foodMl = food.reduce((sum, d) => sum + d.ml, 0);
  return { ml: loggedMl + foodMl, loggedMl, foodMl, food };
}

export interface DailyWater {
  date: string;
  ml: number;
  count: number;
}

/** Summa per dag, äldst först. */
export function dailyWater(entries: readonly DatedWater[]): DailyWater[] {
  const byDate = new Map<string, DailyWater>();
  for (const e of entries) {
    const day = byDate.get(e.date);
    if (day) {
      day.ml += e.ml;
      day.count += 1;
    } else {
      byDate.set(e.date, { date: e.date, ml: e.ml, count: 1 });
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function waterOn(entries: readonly DatedWater[], date: string): number {
  return entries.reduce((sum, e) => (e.date === date ? sum + e.ml : sum), 0);
}
