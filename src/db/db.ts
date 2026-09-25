import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from 'idb';
import type { ActivityLevel, Sex } from '../lib/energy.ts';
import type { MealSlot, Nutrients } from '../lib/nutrition.ts';

export const DB_NAME = 'viktresan';
export const DB_VERSION = 4;

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
}

/** Eget livsmedel eller cachad träff från Open Food Facts. Värden per 100 g. */
export interface StoredFood {
  /** `egen:<uuid>` eller `off:<ean>`. */
  id: string;
  name: string;
  source: 'egen' | 'openfoodfacts';
  per100: Nutrients;
  portionG?: number;
  portionName?: string;
  ean?: string;
  createdAt: number;
  updatedAt?: number;
}

/** En ingrediens i en sparad måltid. Namn och näringsvärden kopieras in. */
export interface MealIngredient {
  foodId: string;
  name: string;
  grams: number;
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
export interface FoodLogEntry {
  id: string;
  date: string;
  meal: MealSlot;
  foodId: string;
  name: string;
  grams: number;
  per100: Nutrients;
  /** Satt när posten loggades i portioner: gram = antal × portionens vikt. */
  portionName?: string;
  portionCount?: number;
  createdAt: number;
  updatedAt?: number;
}

/** Ett favoritmarkerat livsmedel (eller en måltid, `maltid:<id>`). */
export interface Favorite {
  foodId: string;
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
}

export async function putFood(food: StoredFood): Promise<void> {
  const db = await getDb();
  await db.put('foods', food);
}

export async function deleteFood(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['foods', 'favorites'], 'readwrite');
  await Promise.all([tx.objectStore('foods').delete(id), tx.objectStore('favorites').delete(id)]);
  await tx.done;
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
  const tx = db.transaction(['meals', 'favorites'], 'readwrite');
  await Promise.all([
    tx.objectStore('meals').delete(id),
    tx.objectStore('favorites').delete(`maltid:${id}`),
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

export async function putPhoto(photo: PhotoEntry): Promise<void> {
  const db = await getDb();
  await db.put('photos', photo);
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

/** Nycklar i `settings`-storen. */
export const SETTING_LAST_EXPORT = 'lastExportAt';
export const SETTING_LOCK = 'lock';

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
  };
}

export async function readSnapshot(): Promise<Snapshot> {
  const [profile, weights, waist, steps, photos, foods, meals, foodLog, favorites] =
    await Promise.all([
      getProfile(),
      listWeights(),
      listWaist(),
      listSteps(),
      listPhotos(),
      listFoods(),
      listMeals(),
      listFoodLog(),
      listFavorites(),
    ]);
  return { profile, weights, waist, steps, photos, foods, meals, foodLog, favorites };
}

/**
 * `replace`: all befintlig data (profil, vikt, midja, steg, bilder, mat) ersätts.
 * `merge`: poster läggs till; vid samma nyckel (`id`, för midja/steg datumet, för
 * favoriter `foodId`) vinner den senast ändrade (`updatedAt ?? createdAt`, lika →
 * befintlig behålls). Befintlig profil behålls.
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
    if (snapshot.profile && !(await profile.get(PROFILE_KEY))) {
      await profile.put(snapshot.profile, PROFILE_KEY);
    }
  }
  await tx.done;
}

/** När den äldsta posten (vikt, midja, steg, bild eller matlogg) skapades (ms), eller null. */
export async function getOldestEntryTime(): Promise<number | null> {
  const db = await getDb();
  const all = await Promise.all([
    db.getAll('weights'),
    db.getAll('waist'),
    db.getAll('steps'),
    db.getAll('photos'),
    db.getAll('foodLog'),
  ]);
  let oldest: number | null = null;
  for (const { createdAt } of all.flat()) {
    if (oldest === null || createdAt < oldest) oldest = createdAt;
  }
  return oldest;
}
