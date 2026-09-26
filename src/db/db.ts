import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from 'idb';
import type { ActivityLevel, Sex } from '../lib/energy.ts';
import type { DoseFrequency, InjectionSite } from '../lib/glp1.ts';
import type { MealSlot, Nutrients } from '../lib/nutrition.ts';
import { GRAM, type FoodUnit } from '../lib/units.ts';
import type { Intensity, WorkoutStatus } from '../lib/workouts.ts';

export const DB_NAME = 'viktresan';
export const DB_VERSION = 8;

/**
 * En viktmätning. Datum lagras som ISO-sträng (YYYY-MM-DD) i lokal tid.
 * Flera mätningar samma dag är tillåtna; beräkningarna slår ihop dem.
 */
export interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
  note?: string;
  createdAt: number;
  updatedAt?: number;
}

/** Midjemått. Ett per dag – datumet är nyckeln (sedan v3). */
export interface WaistEntry {
  date: string;
  waistCm: number;
  createdAt: number;
  updatedAt?: number;
}

/** Steg. Ett värde per dag – datumet är nyckeln (sedan v3). */
export interface StepsEntry {
  date: string;
  steps: number;
  createdAt: number;
  updatedAt?: number;
}

/**
 * Mätning i den kombinerade modellen från v1–v2 (och säkerhetskopior version 1):
 * vikt med valfritt midjemått, steg och anteckning i samma post.
 */
export interface LegacyMeasurement extends WeightEntry {
  waistCm?: number;
  steps?: number;
}

/** Användarens profil. Det finns bara en, lagrad under nyckeln `PROFILE_KEY`. */
export interface Profile {
  startDate: string;
  startWeightKg: number;
  heightCm: number;
  goalWeightKg: number;
  goalDate?: string;
  /** Sedan v4 (utan schemaändring): underlag för kalorimålet. Valfria för äldre profiler. */
  sex?: Sex;
  birthYear?: number;
  activityLevel?: ActivityLevel;
  /** Önskad takt i kg per vecka (0,25–1,0). Saknas → 0,5. */
  ratePerWeekKg?: number;
  /** Sedan v5 (utan schemaändring): eget vattenmål i ml. Saknas → 33 ml × trendvikten. */
  waterGoalMl?: number;
  /** Proteinmål = faktor × målvikt (1,2–2,0 g/kg). Saknas → 1,6. Utan schemaändring. */
  proteinFactor?: number;
}

/**
 * Eget livsmedel eller cachad träff från Open Food Facts. Värden per 100 g.
 * `units` (sedan v7) är produktens egna enheter, dvs. portionen från Open Food
 * Facts. Användarens egna enheter ligger i `foodUnits`.
 */
export interface StoredFood {
  /** `egen:<uuid>` eller `off:<ean>`. */
  id: string;
  name: string;
  source: 'egen' | 'openfoodfacts';
  per100: Nutrients;
  units?: FoodUnit[];
  ean?: string;
  createdAt: number;
  updatedAt?: number;
}

/** Livsmedel i v4–v6: en valfri portion i stället för `units`. */
export interface LegacyStoredFood extends Omit<StoredFood, 'units'> {
  units?: FoodUnit[];
  portionG?: number;
  portionName?: string;
}

/**
 * Användarens egna enheter för ett livsmedel (sedan v7), nyckel = `foodId`.
 * Gäller alla källor – även Livsmedelsverket och måltider, som inte lagras i `foods`.
 */
export interface CustomUnits {
  foodId: string;
  units: FoodUnit[];
  createdAt: number;
  updatedAt?: number;
}

/**
 * Mängd i en enhet och uträknade gram (sedan v7). `unit` är `g` för gram. Gram
 * sparas så att posten inte ändras om enheten redigeras eller tas bort senare.
 */
export interface LoggedAmount {
  amount: number;
  unit: string;
  grams: number;
}

/** En ingrediens i en sparad måltid. Namn och näringsvärden kopieras in. */
export interface MealIngredient extends LoggedAmount {
  foodId: string;
  name: string;
  per100: Nutrients;
}

/** Sparad måltid med flera ingredienser. */
export interface SavedMeal {
  id: string;
  name: string;
  items: MealIngredient[];
  createdAt: number;
  updatedAt?: number;
}

/**
 * En post i matloggen. Namn och näringsvärden per 100 g kopieras in så att
 * loggen inte ändras om livsmedlet ändras eller tas bort.
 */
export interface FoodLogEntry extends LoggedAmount {
  id: string;
  date: string;
  meal: MealSlot;
  foodId: string;
  name: string;
  per100: Nutrients;
  createdAt: number;
  updatedAt?: number;
}

/** Mängd i v4–v6: gram, och antal portioner om posten loggades i portioner. */
export interface LegacyAmount {
  grams: number;
  amount?: number;
  unit?: string;
  portionName?: string;
  portionCount?: number;
}

export type LegacyFoodLogEntry = Omit<FoodLogEntry, keyof LoggedAmount> & LegacyAmount;
export type LegacyMealIngredient = Omit<MealIngredient, keyof LoggedAmount> & LegacyAmount;
export type LegacySavedMeal = Omit<SavedMeal, 'items'> & { items: LegacyMealIngredient[] };

/** Ett favoritmarkerat livsmedel (eller en måltid, `maltid:<id>`). */
export interface Favorite {
  foodId: string;
  createdAt: number;
}

/** Vatten: en post per tillfälle (+250 ml osv.), flera per dag (sedan v5). */
export interface WaterEntry {
  id: string;
  date: string;
  ml: number;
  createdAt: number;
  updatedAt?: number;
}

/**
 * Ett träningspass (sedan v5). Pass ur ett återkommande schema sparas först när de
 * besvaras (klar/hoppade över) och har då id `<planId>:<datum>`.
 */
export interface Workout {
  id: string;
  date: string;
  /** Lokal tid "HH:MM". Saknas → passet gäller hela dagen. */
  time?: string;
  type: string;
  durationMin: number;
  intensity?: Intensity;
  note?: string;
  status: WorkoutStatus;
  planId?: string;
  createdAt: number;
  updatedAt?: number;
}

/** Återkommande planering, t.ex. mån/ons/fre 07:00 (sedan v5). */
export interface WorkoutPlan {
  id: string;
  type: string;
  /** 0 = måndag … 6 = söndag. */
  weekdays: number[];
  time: string;
  durationMin: number;
  intensity?: Intensity;
  note?: string;
  startDate: string;
  endDate?: string;
  createdAt: number;
  updatedAt?: number;
}

/** Ett steg i dostrappan: dosen gäller från och med datumet (sedan v6). */
export interface DoseStep {
  date: string;
  doseMg: number;
}

/**
 * Ett GLP-1-läkemedel med schema och dostrappa (sedan v6). Trappan läggs in av
 * användaren enligt förskrivarens ordination – appen föreslår aldrig doser.
 * Schemat börjar vid trappans första steg.
 */
export interface Medication {
  id: string;
  name: string;
  frequency: DoseFrequency;
  /** Veckovis: 0 = måndag … 6 = söndag. */
  weekday?: number;
  /** Lokal tid "HH:MM". */
  time: string;
  /** Minst ett steg, sorterade på datum, unika datum. */
  steps: DoseStep[];
  /** Sista dagen med schemalagd dos (valfri). */
  endDate?: string;
  createdAt: number;
  updatedAt?: number;
}

/** En loggad injektion (sedan v6). Läkemedlets namn kopieras in. */
export interface Injection {
  id: string;
  date: string;
  /** Lokal tid "HH:MM". */
  time?: string;
  medicationId: string;
  medicationName: string;
  doseMg: number;
  site?: InjectionSite;
  createdAt: number;
  updatedAt?: number;
}

/** Aptit och biverkningar en dag (sedan v6). Nyckel = datum, ett per dag. */
export interface SymptomEntry {
  date: string;
  /** 1 = ingen aptit … 5 = stor aptit. */
  appetite?: number;
  /** Förval och egen text. */
  sideEffects: string[];
  createdAt: number;
  updatedAt?: number;
}

/**
 * En uppnådd milstolpe (sedan v8). Nyckel = milstolpens id (t.ex. `kg-5`, `dagar-30`),
 * så varje milstolpe sparas en gång. `date` är dagen den nåddes.
 */
export interface MilestoneRecord {
  id: string;
  date: string;
  createdAt: number;
}

/**
 * Ett progressfoto. Bilden lagras som Blob direkt i IndexedDB, komprimerad och
 * utan metadata. Vikt och mått är valfria fält (tillagda utan schemaändring).
 */
export interface PhotoEntry {
  id: string;
  date: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
  weightKg?: number;
  width?: number;
  height?: number;
}

export interface ViktresanDB extends DBSchema {
  /** Viktmätningar. I v1–v2 innehöll storen även midja och steg (`LegacyMeasurement`). */
  weights: {
    key: string;
    value: WeightEntry;
    indexes: { 'by-date': string };
  };
  /** Sedan v3. Nyckel = datum. */
  waist: {
    key: string;
    value: WaistEntry;
  };
  /** Sedan v3. Nyckel = datum. */
  steps: {
    key: string;
    value: StepsEntry;
  };
  photos: {
    key: string;
    value: PhotoEntry;
    indexes: { 'by-date': string };
  };
  settings: {
    key: string;
    value: unknown;
  };
  /** Sedan v2. */
  profile: {
    key: string;
    value: Profile;
  };
  /** Sedan v4. Egna livsmedel och cachade Open Food Facts-produkter. */
  foods: {
    key: string;
    value: StoredFood;
    indexes: { 'by-ean': string };
  };
  /** Sedan v4. */
  meals: {
    key: string;
    value: SavedMeal;
  };
  /** Sedan v4. */
  foodLog: {
    key: string;
    value: FoodLogEntry;
    indexes: { 'by-date': string };
  };
  /** Sedan v4. Nyckel = `foodId`. */
  favorites: {
    key: string;
    value: Favorite;
  };
  /** Sedan v5. */
  water: {
    key: string;
    value: WaterEntry;
    indexes: { 'by-date': string };
  };
  /** Sedan v5. */
  workouts: {
    key: string;
    value: Workout;
    indexes: { 'by-date': string };
  };
  /** Sedan v5. */
  workoutPlans: {
    key: string;
    value: WorkoutPlan;
  };
  /** Sedan v6. */
  medications: {
    key: string;
    value: Medication;
  };
  /** Sedan v6. */
  injections: {
    key: string;
    value: Injection;
    indexes: { 'by-date': string };
  };
  /** Sedan v6. Nyckel = datum. */
  symptoms: {
    key: string;
    value: SymptomEntry;
  };
  /** Sedan v7. Egna enheter per livsmedel, nyckel = `foodId`. */
  foodUnits: {
    key: string;
    value: CustomUnits;
  };
  /** Sedan v8. Uppnådda milstolpar, nyckel = milstolpens id. */
  milestones: {
    key: string;
    value: MilestoneRecord;
  };
}

export type Database = IDBPDatabase<ViktresanDB>;

function changedAt(entry: { createdAt: number; updatedAt?: number }): number {
  return entry.updatedAt ?? entry.createdAt;
}

/**
 * Delar upp mätningar i den gamla kombinerade modellen i vikt, midja och steg.
 * Midja och steg blir ett värde per dag: den senast registrerade posten vinner
 * (stegräknare visar en löpande dagssumma). Används av migreringen till v3 och
 * vid import av säkerhetskopior version 1.
 */
export function splitLegacyMeasurements(legacy: readonly LegacyMeasurement[]): {
  weights: WeightEntry[];
  waist: WaistEntry[];
  steps: StepsEntry[];
} {
  const weights: WeightEntry[] = [];
  const waist = new Map<string, WaistEntry>();
  const steps = new Map<string, StepsEntry>();
  for (const m of legacy) {
    const weight: WeightEntry = {
      id: m.id,
      date: m.date,
      weightKg: m.weightKg,
      createdAt: m.createdAt,
    };
    if (m.note !== undefined) weight.note = m.note;
    if (m.updatedAt !== undefined) weight.updatedAt = m.updatedAt;
    weights.push(weight);
  }
  const ordered = [...legacy].sort((a, b) => a.createdAt - b.createdAt);
  for (const m of ordered) {
    const { waistCm, steps: stepCount } = m;
    const times: { createdAt: number; updatedAt?: number } = { createdAt: m.createdAt };
    if (m.updatedAt !== undefined) times.updatedAt = m.updatedAt;
    if (waistCm !== undefined) waist.set(m.date, { date: m.date, waistCm, ...times });
    if (stepCount !== undefined) steps.set(m.date, { date: m.date, steps: stepCount, ...times });
  }
  const byDate = (a: { date: string }, b: { date: string }) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  return {
    weights,
    waist: [...waist.values()].sort(byDate),
    steps: [...steps.values()].sort(byDate),
  };
}

/**
 * Mängd i v4–v6 → v7: poster loggade i portioner får enheten (portionens namn) och
 * antalet; övriga tolkas som gram. Gram behålls oförändrade. Används av migreringen
 * till v7 och vid import av säkerhetskopior version 3–5.
 */
export function upgradeAmount(value: LegacyAmount): LoggedAmount {
  if (value.amount !== undefined && value.unit !== undefined) {
    return { amount: value.amount, unit: value.unit, grams: value.grams };
  }
  if (value.portionCount !== undefined && value.portionCount > 0) {
    return {
      amount: value.portionCount,
      unit: value.portionName?.trim() || 'portion',
      grams: value.grams,
    };
  }
  return { amount: value.grams, unit: GRAM, grams: value.grams };
}

function withoutLegacyAmount<T extends LegacyAmount>(
  value: T,
): Omit<T, 'amount' | 'unit' | 'grams' | 'portionName' | 'portionCount'> {
  const rest: Partial<T> = { ...value };
  delete rest.amount;
  delete rest.unit;
  delete rest.grams;
  delete rest.portionName;
  delete rest.portionCount;
  return rest as Omit<T, 'amount' | 'unit' | 'grams' | 'portionName' | 'portionCount'>;
}

export function upgradeFoodLogEntry(entry: LegacyFoodLogEntry): FoodLogEntry {
  return { ...withoutLegacyAmount(entry), ...upgradeAmount(entry) };
}

export function upgradeMeal(meal: LegacySavedMeal): SavedMeal {
  return {
    ...meal,
    items: meal.items.map((item) => ({ ...withoutLegacyAmount(item), ...upgradeAmount(item) })),
  };
}

/**
 * Livsmedel i v4–v6 → v7: portionen blir en enhet. För Open Food Facts-produkter
 * är den produktens (`units`), för egna livsmedel en egen enhet (`foodUnits`).
 */
export function upgradeFood(food: LegacyStoredFood): {
  food: StoredFood;
  custom: CustomUnits | null;
} {
  const { portionG, portionName, ...rest } = food;
  const result: StoredFood = { ...rest };
  if (portionG === undefined || !(portionG > 0)) return { food: result, custom: null };
  const name = portionName?.trim() || 'portion';
  if (food.source === 'openfoodfacts') {
    result.units = mergeFoodUnits(result.units, [
      { name, grams: portionG, source: 'openfoodfacts' },
    ]);
    return { food: result, custom: null };
  }
  const times: { createdAt: number; updatedAt?: number } = { createdAt: food.createdAt };
  if (food.updatedAt !== undefined) times.updatedAt = food.updatedAt;
  return {
    food: result,
    custom: { foodId: food.id, units: [{ name, grams: portionG, source: 'egen' }], ...times },
  };
}

function mergeFoodUnits(a: FoodUnit[] | undefined, b: FoodUnit[]): FoodUnit[] {
  const names = new Set(b.map((u) => u.name.toLowerCase()));
  return [...(a ?? []).filter((u) => !names.has(u.name.toLowerCase())), ...b];
}

/** Uppgraderar mat i v4–v6-format (databasmigrering och gamla säkerhetskopior). */
export function upgradeFoodData(data: {
  foods: readonly LegacyStoredFood[];
  meals: readonly LegacySavedMeal[];
  foodLog: readonly LegacyFoodLogEntry[];
}): {
  foods: StoredFood[];
  meals: SavedMeal[];
  foodLog: FoodLogEntry[];
  foodUnits: CustomUnits[];
} {
  const foods: StoredFood[] = [];
  const foodUnits: CustomUnits[] = [];
  for (const f of data.foods) {
    const { food, custom } = upgradeFood(f);
    foods.push(food);
    if (custom) foodUnits.push(custom);
  }
  return {
    foods,
    meals: data.meals.map(upgradeMeal),
    foodLog: data.foodLog.map(upgradeFoodLogEntry),
    foodUnits,
  };
}

export const PROFILE_KEY = 'current';

type UpgradeTransaction = IDBPTransaction<ViktresanDB, StoreNames<ViktresanDB>[], 'versionchange'>;

/** v2 → v3: skriver om `weights` utan midja/steg och fyller `waist` och `steps`. */
async function migrateToV3(tx: UpgradeTransaction): Promise<void> {
  const weights = tx.objectStore('weights');
  const legacy: LegacyMeasurement[] = await weights.getAll();
  const split = splitLegacyMeasurements(legacy);
  const waist = tx.objectStore('waist');
  const steps = tx.objectStore('steps');
  await Promise.all([
    ...split.weights.map((w) => weights.put(w)),
    ...split.waist.map((w) => waist.put(w)),
    ...split.steps.map((s) => steps.put(s)),
  ]);
}

/** v6 → v7: portioner blir enheter, matloggen och måltiderna får mängd + enhet. */
async function migrateToV7(tx: UpgradeTransaction): Promise<void> {
  const foods = tx.objectStore('foods');
  const meals = tx.objectStore('meals');
  const foodLog = tx.objectStore('foodLog');
  const foodUnits = tx.objectStore('foodUnits');
  const [legacyFoods, legacyMeals, legacyLog] = await Promise.all([
    foods.getAll() as Promise<LegacyStoredFood[]>,
    meals.getAll() as Promise<LegacySavedMeal[]>,
    foodLog.getAll() as Promise<LegacyFoodLogEntry[]>,
  ]);
  const upgraded = upgradeFoodData({
    foods: legacyFoods,
    meals: legacyMeals,
    foodLog: legacyLog,
  });
  await Promise.all([
    ...upgraded.foods.map((f) => foods.put(f)),
    ...upgraded.meals.map((m) => meals.put(m)),
    ...upgraded.foodLog.map((e) => foodLog.put(e)),
    ...upgraded.foodUnits.map((u) => foodUnits.put(u)),
  ]);
}

let dbPromise: Promise<Database> | null = null;

/**
 * Öppnar (och vid behov uppgraderar) databasen. Nya versioner läggs till som
 * nya `if (oldVersion < N)`-block – ändra aldrig ett befintligt block.
 */
export function getDb(): Promise<Database> {
  dbPromise ??= openDB<ViktresanDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const weights = db.createObjectStore('weights', { keyPath: 'id' });
        weights.createIndex('by-date', 'date');
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('by-date', 'date');
        db.createObjectStore('settings');
      }
      if (oldVersion < 2) {
        // v2: profil i egen store. Mätningar fick valfria fält (midja, steg),
        // vilket inte kräver någon datamigrering – befintliga poster är giltiga.
        db.createObjectStore('profile');
      }
      if (oldVersion < 3) {
        // v3: midja och steg flyttas ut ur `weights` till egna stores, ett värde per dag.
        db.createObjectStore('waist', { keyPath: 'date' });
        db.createObjectStore('steps', { keyPath: 'date' });
        if (oldVersion >= 1) void migrateToV3(transaction);
      }
      if (oldVersion < 4) {
        // v4: matloggning. Nya stores – befintlig data berörs inte.
        const foods = db.createObjectStore('foods', { keyPath: 'id' });
        foods.createIndex('by-ean', 'ean');
        db.createObjectStore('meals', { keyPath: 'id' });
        const foodLog = db.createObjectStore('foodLog', { keyPath: 'id' });
        foodLog.createIndex('by-date', 'date');
        db.createObjectStore('favorites', { keyPath: 'foodId' });
      }
      if (oldVersion < 5) {
        // v5: vatten och träning. Nya stores – befintlig data berörs inte.
        const water = db.createObjectStore('water', { keyPath: 'id' });
        water.createIndex('by-date', 'date');
        const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
        workouts.createIndex('by-date', 'date');
        db.createObjectStore('workoutPlans', { keyPath: 'id' });
      }
      if (oldVersion < 6) {
        // v6: GLP-1 (läkemedel, injektioner, mående). Nya stores – befintlig data berörs inte.
        db.createObjectStore('medications', { keyPath: 'id' });
        const injections = db.createObjectStore('injections', { keyPath: 'id' });
        injections.createIndex('by-date', 'date');
        db.createObjectStore('symptoms', { keyPath: 'date' });
      }
      if (oldVersion < 7) {
        // v7: enheter för matloggning. Egna enheter i en ny store; portioner blir
        // enheter och matloggen/måltiderna får mängd + enhet (äldre poster = gram).
        db.createObjectStore('foodUnits', { keyPath: 'foodId' });
        if (oldVersion >= 4) void migrateToV7(transaction);
      }
      if (oldVersion < 8) {
        // v8: milstolpar. Ny store – redan passerade milstolpar markeras (utan firande)
        // vid nästa start av appen, eftersom de räknas fram ur befintlig data.
        db.createObjectStore('milestones', { keyPath: 'id' });
      }
    },
    blocking() {
      // En nyare version av appen (annan flik) vill uppgradera: släpp anslutningen.
      void dbPromise?.then((db) => {
        db.close();
      });
      dbPromise = null;
    },
  });
  return dbPromise;
}

/** Endast för tester: stänger och glömmer den cachade anslutningen. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

/**
 * Meddelas efter sparningar som kan ge en milstolpe (vikt, midja, steg, profil, mat,
 * vatten, pass, bilder). Import meddelar inte – den markerar milstolpar utan firande.
 */
const changeListeners = new Set<() => void>();

export function onDataChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function notifyChange(): void {
  for (const listener of changeListeners) listener();
}

export function newId(): string {
  return crypto.randomUUID();
}

function byDateThenCreated<T extends { date: string; createdAt: number }>(a: T, b: T): number {
  return a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1;
}

/** Lägger till eller ersätter en viktmätning (samma `id`). */
export async function putWeight(entry: WeightEntry): Promise<void> {
  const db = await getDb();
  await db.put('weights', entry);
  notifyChange();
}

export async function deleteWeight(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('weights', id);
}

/** Alla viktmätningar, äldst först (samma dag: i registreringsordning). */
export async function listWeights(): Promise<WeightEntry[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('weights', 'by-date');
  return all.sort(byDateThenCreated);
}

/**
 * Sparar dagens midjemått. Finns redan ett värde för datumet skrivs det över
 * (`createdAt` behålls, `updatedAt` sätts).
 */
export async function upsertWaist(date: string, waistCm: number, now = Date.now()): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('waist', 'readwrite');
  const existing = await tx.store.get(date);
  await tx.store.put(
    existing
      ? { date, waistCm, createdAt: existing.createdAt, updatedAt: now }
      : { date, waistCm, createdAt: now },
  );
  await tx.done;
  notifyChange();
}

export async function deleteWaist(date: string): Promise<void> {
  const db = await getDb();
  await db.delete('waist', date);
}

/** Alla midjemått, äldst först. */
export async function listWaist(): Promise<WaistEntry[]> {
  const db = await getDb();
  return db.getAll('waist');
}

/** Sparar antal steg för en dag. Finns redan ett värde för datumet skrivs det över. */
export async function upsertSteps(date: string, steps: number, now = Date.now()): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('steps', 'readwrite');
  const existing = await tx.store.get(date);
  await tx.store.put(
    existing
      ? { date, steps, createdAt: existing.createdAt, updatedAt: now }
      : { date, steps, createdAt: now },
  );
  await tx.done;
  notifyChange();
}

/** Alla steg, äldst först. */
export async function listSteps(): Promise<StepsEntry[]> {
  const db = await getDb();
  return db.getAll('steps');
}

export async function getProfile(): Promise<Profile | null> {
  const db = await getDb();
  return (await db.get('profile', PROFILE_KEY)) ?? null;
}

export async function saveProfile(profile: Profile): Promise<void> {
  const db = await getDb();
  await db.put('profile', profile, PROFILE_KEY);
  notifyChange();
}

export async function putFood(food: StoredFood): Promise<void> {
  const db = await getDb();
  await db.put('foods', food);
}

export async function deleteFood(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['foods', 'favorites', 'foodUnits'], 'readwrite');
  await Promise.all([
    tx.objectStore('foods').delete(id),
    tx.objectStore('favorites').delete(id),
    tx.objectStore('foodUnits').delete(id),
  ]);
  await tx.done;
}

/**
 * Sparar användarens egna enheter för ett livsmedel (ersätter listan). En tom
 * lista tar bort posten. Loggade poster påverkas inte – de har sina gram.
 */
export async function saveCustomUnits(
  foodId: string,
  units: readonly FoodUnit[],
  now = Date.now(),
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('foodUnits', 'readwrite');
  const existing = await tx.store.get(foodId);
  if (units.length === 0) {
    if (existing) await tx.store.delete(foodId);
  } else {
    const entry: CustomUnits = existing
      ? { foodId, units: [...units], createdAt: existing.createdAt, updatedAt: now }
      : { foodId, units: [...units], createdAt: now };
    await tx.store.put(entry);
  }
  await tx.done;
}

export async function listCustomUnits(): Promise<CustomUnits[]> {
  const db = await getDb();
  return db.getAll('foodUnits');
}

/** Egna livsmedel och cachade produkter, sorterade på namn. */
export async function listFoods(): Promise<StoredFood[]> {
  const db = await getDb();
  const all = await db.getAll('foods');
  return all.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

/** Ett eget livsmedel eller en cachad produkt med streckkoden (egna går före). */
export async function findFoodByEan(ean: string): Promise<StoredFood | null> {
  const db = await getDb();
  const hits = await db.getAllFromIndex('foods', 'by-ean', ean);
  return hits.find((f) => f.source === 'egen') ?? hits[0] ?? null;
}

export async function putMeal(meal: SavedMeal): Promise<void> {
  const db = await getDb();
  await db.put('meals', meal);
}

export async function deleteMeal(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['meals', 'favorites', 'foodUnits'], 'readwrite');
  await Promise.all([
    tx.objectStore('meals').delete(id),
    tx.objectStore('favorites').delete(`maltid:${id}`),
    tx.objectStore('foodUnits').delete(`maltid:${id}`),
  ]);
  await tx.done;
}

export async function listMeals(): Promise<SavedMeal[]> {
  const db = await getDb();
  const all = await db.getAll('meals');
  return all.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

export async function putFoodLog(entry: FoodLogEntry): Promise<void> {
  const db = await getDb();
  await db.put('foodLog', entry);
  notifyChange();
}

export async function deleteFoodLog(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('foodLog', id);
}

/** Hela matloggen, äldst först (samma dag: i registreringsordning). */
export async function listFoodLog(): Promise<FoodLogEntry[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('foodLog', 'by-date');
  return all.sort(byDateThenCreated);
}

export async function listFavorites(): Promise<Favorite[]> {
  const db = await getDb();
  const all = await db.getAll('favorites');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function setFavorite(foodId: string, favorite: boolean, now = Date.now()) {
  const db = await getDb();
  if (favorite) await db.put('favorites', { foodId, createdAt: now });
  else await db.delete('favorites', foodId);
}

/**
 * Lägger till en vattenpost. `createdAt` hålls strikt växande per dag så att
 * "Ångra senaste" alltid hittar rätt post, även vid två tryck samma millisekund.
 */
export async function addWater(date: string, ml: number, now = Date.now()): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('water', 'readwrite');
  const entries = await tx.store.index('by-date').getAll(date);
  const latest = Math.max(-1, ...entries.map((e) => e.createdAt));
  await tx.store.put({ id: newId(), date, ml, createdAt: Math.max(now, latest + 1) });
  await tx.done;
  notifyChange();
}

/** Ångrar dagens senast registrerade vattenpost. Returnerar den borttagna posten. */
export async function undoLastWater(date: string): Promise<WaterEntry | null> {
  const db = await getDb();
  const tx = db.transaction('water', 'readwrite');
  const entries = await tx.store.index('by-date').getAll(date);
  const last = entries.sort((a, b) => a.createdAt - b.createdAt).at(-1) ?? null;
  if (last) await tx.store.delete(last.id);
  await tx.done;
  return last;
}

/** Alla vattenposter, äldst först. */
export async function listWater(): Promise<WaterEntry[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('water', 'by-date');
  return all.sort(byDateThenCreated);
}

export async function putWorkout(workout: Workout): Promise<void> {
  const db = await getDb();
  await db.put('workouts', workout);
  notifyChange();
}

export async function deleteWorkout(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('workouts', id);
}

/** Alla sparade pass, äldst först. */
export async function listWorkouts(): Promise<Workout[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('workouts', 'by-date');
  return all.sort(byDateThenCreated);
}

export async function putWorkoutPlan(plan: WorkoutPlan): Promise<void> {
  const db = await getDb();
  await db.put('workoutPlans', plan);
}

export async function deleteWorkoutPlan(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('workoutPlans', id);
}

export async function listWorkoutPlans(): Promise<WorkoutPlan[]> {
  const db = await getDb();
  const all = await db.getAll('workoutPlans');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putMedication(medication: Medication): Promise<void> {
  const db = await getDb();
  await db.put('medications', medication);
}

/** Tar bort läkemedlet. Loggade injektioner ligger kvar (namnet är inkopierat). */
export async function deleteMedication(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('medications', id);
}

export async function listMedications(): Promise<Medication[]> {
  const db = await getDb();
  const all = await db.getAll('medications');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putInjection(injection: Injection): Promise<void> {
  const db = await getDb();
  await db.put('injections', injection);
}

export async function deleteInjection(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('injections', id);
}

/** Alla injektioner, äldst först (samma dag: i registreringsordning). */
export async function listInjections(): Promise<Injection[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('injections', 'by-date');
  return all.sort(byDateThenCreated);
}

/**
 * Sparar dagens aptit och biverkningar. Finns redan en post för datumet skrivs
 * den över (`createdAt` behålls, `updatedAt` sätts).
 */
export async function upsertSymptoms(
  date: string,
  values: { appetite?: number; sideEffects: string[] },
  now = Date.now(),
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('symptoms', 'readwrite');
  const existing = await tx.store.get(date);
  const entry: SymptomEntry = existing
    ? { date, sideEffects: values.sideEffects, createdAt: existing.createdAt, updatedAt: now }
    : { date, sideEffects: values.sideEffects, createdAt: now };
  if (values.appetite !== undefined) entry.appetite = values.appetite;
  await tx.store.put(entry);
  await tx.done;
}

export async function deleteSymptoms(date: string): Promise<void> {
  const db = await getDb();
  await db.delete('symptoms', date);
}

/** Alla dagar med mående, äldst först. */
export async function listSymptoms(): Promise<SymptomEntry[]> {
  const db = await getDb();
  return db.getAll('symptoms');
}

export async function putPhoto(photo: PhotoEntry): Promise<void> {
  const db = await getDb();
  await db.put('photos', photo);
  notifyChange();
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('photos', id);
}

/** Alla bilder, äldst först (samma dag: i registreringsordning). */
export async function listPhotos(): Promise<PhotoEntry[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('photos', 'by-date');
  return all.sort(byDateThenCreated);
}

/** Datum för alla bilder (en post per bild), utan att läsa in bilddatan. */
export async function listPhotoDates(): Promise<string[]> {
  const db = await getDb();
  const dates: string[] = [];
  let cursor = await db.transaction('photos').store.index('by-date').openKeyCursor();
  while (cursor) {
    dates.push(cursor.key);
    cursor = await cursor.continue();
  }
  return dates;
}

/** Uppnådda milstolpar, äldst först. */
export async function listMilestones(): Promise<MilestoneRecord[]> {
  const db = await getDb();
  const all = await db.getAll('milestones');
  return all.sort((a, b) =>
    a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1,
  );
}

/** Sparar nya milstolpar. En redan sparad milstolpe skrivs aldrig över (den nås en gång). */
export async function addMilestones(records: readonly MilestoneRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('milestones', 'readwrite');
  for (const record of records) {
    if (!(await tx.store.get(record.id))) await tx.store.put(record);
  }
  await tx.done;
}

/** Nycklar i `settings`-storen. */
export const SETTING_LAST_EXPORT = 'lastExportAt';
export const SETTING_LOCK = 'lock';
export const SETTING_FEATURES = 'features';
export const SETTING_PREFERENCES = 'preferences';

export async function getSetting(key: string): Promise<unknown> {
  const db = await getDb();
  return db.get('settings', key);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('settings', value, key);
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDb();
  await db.delete('settings', key);
}

/** All användardata – det som ingår i en säkerhetskopia. Inställningar ingår inte. */
export interface Snapshot {
  profile: Profile | null;
  weights: WeightEntry[];
  waist: WaistEntry[];
  steps: StepsEntry[];
  photos: PhotoEntry[];
  foods: StoredFood[];
  meals: SavedMeal[];
  foodLog: FoodLogEntry[];
  favorites: Favorite[];
  water: WaterEntry[];
  workouts: Workout[];
  workoutPlans: WorkoutPlan[];
  medications: Medication[];
  injections: Injection[];
  symptoms: SymptomEntry[];
  foodUnits: CustomUnits[];
  milestones: MilestoneRecord[];
}

export function emptySnapshot(): Snapshot {
  return {
    profile: null,
    weights: [],
    waist: [],
    steps: [],
    photos: [],
    foods: [],
    meals: [],
    foodLog: [],
    favorites: [],
    water: [],
    workouts: [],
    workoutPlans: [],
    medications: [],
    injections: [],
    symptoms: [],
    foodUnits: [],
    milestones: [],
  };
}

export async function readSnapshot(): Promise<Snapshot> {
  const [
    profile,
    weights,
    waist,
    steps,
    photos,
    foods,
    meals,
    foodLog,
    favorites,
    water,
    workouts,
    workoutPlans,
    medications,
    injections,
    symptoms,
    foodUnits,
    milestones,
  ] = await Promise.all([
    getProfile(),
    listWeights(),
    listWaist(),
    listSteps(),
    listPhotos(),
    listFoods(),
    listMeals(),
    listFoodLog(),
    listFavorites(),
    listWater(),
    listWorkouts(),
    listWorkoutPlans(),
    listMedications(),
    listInjections(),
    listSymptoms(),
    listCustomUnits(),
    listMilestones(),
  ]);
  return {
    profile,
    weights,
    waist,
    steps,
    photos,
    foods,
    meals,
    foodLog,
    favorites,
    water,
    workouts,
    workoutPlans,
    medications,
    injections,
    symptoms,
    foodUnits,
    milestones,
  };
}

/**
 * `replace`: all befintlig data (profil, vikt, midja, steg, bilder, mat, vatten, träning, GLP-1) ersätts.
 * `merge`: poster läggs till; vid samma nyckel (`id`, för midja/steg/mående datumet, för
 * favoriter och egna enheter `foodId`) vinner den senast ändrade (`updatedAt ?? createdAt`, lika →
 * befintlig behålls). Befintlig profil behålls. En milstolpe som redan finns behålls (den nås en gång).
 */
export type ImportMode = 'replace' | 'merge';

const DATA_STORES = [
  'weights',
  'waist',
  'steps',
  'photos',
  'profile',
  'foods',
  'meals',
  'foodLog',
  'favorites',
  'water',
  'workouts',
  'workoutPlans',
  'medications',
  'injections',
  'symptoms',
  'foodUnits',
  'milestones',
] as const;

/** Skriver in en snapshot i en enda transaktion – antingen går allt igenom eller inget. */
export async function applySnapshot(snapshot: Snapshot, mode: ImportMode): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([...DATA_STORES], 'readwrite');
  const weights = tx.objectStore('weights');
  const waist = tx.objectStore('waist');
  const steps = tx.objectStore('steps');
  const photos = tx.objectStore('photos');
  const profile = tx.objectStore('profile');
  const foods = tx.objectStore('foods');
  const meals = tx.objectStore('meals');
  const foodLog = tx.objectStore('foodLog');
  const favorites = tx.objectStore('favorites');
  const water = tx.objectStore('water');
  const workouts = tx.objectStore('workouts');
  const workoutPlans = tx.objectStore('workoutPlans');
  const medications = tx.objectStore('medications');
  const injections = tx.objectStore('injections');
  const symptoms = tx.objectStore('symptoms');
  const foodUnits = tx.objectStore('foodUnits');
  const milestones = tx.objectStore('milestones');

  if (mode === 'replace') {
    await Promise.all(DATA_STORES.map((name) => tx.objectStore(name).clear()));
    await Promise.all([
      ...snapshot.weights.map((w) => weights.put(w)),
      ...snapshot.waist.map((w) => waist.put(w)),
      ...snapshot.steps.map((s) => steps.put(s)),
      ...snapshot.photos.map((p) => photos.put(p)),
      ...snapshot.foods.map((f) => foods.put(f)),
      ...snapshot.meals.map((m) => meals.put(m)),
      ...snapshot.foodLog.map((e) => foodLog.put(e)),
      ...snapshot.favorites.map((f) => favorites.put(f)),
      ...snapshot.water.map((w) => water.put(w)),
      ...snapshot.workouts.map((w) => workouts.put(w)),
      ...snapshot.workoutPlans.map((p) => workoutPlans.put(p)),
      ...snapshot.medications.map((m) => medications.put(m)),
      ...snapshot.injections.map((i) => injections.put(i)),
      ...snapshot.symptoms.map((s) => symptoms.put(s)),
      ...snapshot.foodUnits.map((u) => foodUnits.put(u)),
      ...snapshot.milestones.map((m) => milestones.put(m)),
      ...(snapshot.profile ? [profile.put(snapshot.profile, PROFILE_KEY)] : []),
    ]);
  } else {
    for (const w of snapshot.weights) {
      const existing = await weights.get(w.id);
      if (!existing || changedAt(w) > changedAt(existing)) await weights.put(w);
    }
    for (const w of snapshot.waist) {
      const existing = await waist.get(w.date);
      if (!existing || changedAt(w) > changedAt(existing)) await waist.put(w);
    }
    for (const s of snapshot.steps) {
      const existing = await steps.get(s.date);
      if (!existing || changedAt(s) > changedAt(existing)) await steps.put(s);
    }
    for (const p of snapshot.photos) {
      const existing = await photos.get(p.id);
      if (!existing || p.createdAt > existing.createdAt) await photos.put(p);
    }
    for (const f of snapshot.foods) {
      const existing = await foods.get(f.id);
      if (!existing || changedAt(f) > changedAt(existing)) await foods.put(f);
    }
    for (const m of snapshot.meals) {
      const existing = await meals.get(m.id);
      if (!existing || changedAt(m) > changedAt(existing)) await meals.put(m);
    }
    for (const e of snapshot.foodLog) {
      const existing = await foodLog.get(e.id);
      if (!existing || changedAt(e) > changedAt(existing)) await foodLog.put(e);
    }
    for (const f of snapshot.favorites) {
      if (!(await favorites.get(f.foodId))) await favorites.put(f);
    }
    for (const w of snapshot.water) {
      const existing = await water.get(w.id);
      if (!existing || changedAt(w) > changedAt(existing)) await water.put(w);
    }
    for (const w of snapshot.workouts) {
      const existing = await workouts.get(w.id);
      if (!existing || changedAt(w) > changedAt(existing)) await workouts.put(w);
    }
    for (const p of snapshot.workoutPlans) {
      const existing = await workoutPlans.get(p.id);
      if (!existing || changedAt(p) > changedAt(existing)) await workoutPlans.put(p);
    }
    for (const m of snapshot.medications) {
      const existing = await medications.get(m.id);
      if (!existing || changedAt(m) > changedAt(existing)) await medications.put(m);
    }
    for (const i of snapshot.injections) {
      const existing = await injections.get(i.id);
      if (!existing || changedAt(i) > changedAt(existing)) await injections.put(i);
    }
    for (const s of snapshot.symptoms) {
      const existing = await symptoms.get(s.date);
      if (!existing || changedAt(s) > changedAt(existing)) await symptoms.put(s);
    }
    for (const u of snapshot.foodUnits) {
      const existing = await foodUnits.get(u.foodId);
      if (!existing || changedAt(u) > changedAt(existing)) await foodUnits.put(u);
    }
    for (const m of snapshot.milestones) {
      if (!(await milestones.get(m.id))) await milestones.put(m);
    }
    if (snapshot.profile && !(await profile.get(PROFILE_KEY))) {
      await profile.put(snapshot.profile, PROFILE_KEY);
    }
  }
  await tx.done;
}

/** När den äldsta posten (vikt, midja, steg, bild, matlogg, vatten, pass, GLP-1) skapades (ms), eller null. */
export async function getOldestEntryTime(): Promise<number | null> {
  const db = await getDb();
  const all = await Promise.all([
    db.getAll('weights'),
    db.getAll('waist'),
    db.getAll('steps'),
    db.getAll('photos'),
    db.getAll('foodLog'),
    db.getAll('water'),
    db.getAll('workouts'),
    db.getAll('workoutPlans'),
    db.getAll('medications'),
    db.getAll('injections'),
    db.getAll('symptoms'),
  ]);
  let oldest: number | null = null;
  for (const { createdAt } of all.flat()) {
    if (oldest === null || createdAt < oldest) oldest = createdAt;
  }
  return oldest;
}
