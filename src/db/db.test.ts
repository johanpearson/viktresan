import { afterEach, describe, expect, it } from 'vitest';
import {
  addMilestones,
  addWater,
  DB_NAME,
  DB_VERSION,
  deleteFood,
  deleteFoodLog,
  deleteMeal,
  deletePhoto,
  deletePhotoSession,
  deleteWaist,
  deleteWeight,
  getDb,
  getSetting,
  SETTING_LAST_EXPORT,
  SETTING_PREFERENCES,
  getFoodOverride,
  getOldestEntryTime,
  listFoodOverrides,
  putFoodLogEntries,
  putFoodOverride,
  findMealByEan,
  deleteHiddenFoods,
  hiddenKey,
  listAllFoods,
  listAllMeals,
  readSnapshot,
  applySnapshot,
  restoreFood,
  restoreMeal,
  listHiddenFoods,
  putHiddenFoods,
  findSupplementByEan,
  listSupplementLog,
  listSupplements,
  putSupplement,
  putSupplementIntake,
  deleteSupplement,
  getProfile,
  findFoodByEan,
  listFavorites,
  listCustomUnits,
  listFoodLog,
  listMealSlots,
  countFoodLogByMeal,
  deleteMealSlot,
  putMealSlots,
  listFoods,
  listMeals,
  listMilestones,
  onDataChange,
  listPhotos,
  listPhotoSessions,
  listSteps,
  listWaist,
  listWater,
  listWeights,
  listWorkoutPlans,
  listWorkouts,
  putFood,
  putFoodLog,
  putMeal,
  putPhoto,
  putPhotoSession,
  setPhotoAngle,
  groupLegacyPhotos,
  putWeight,
  putWorkout,
  putWorkoutPlan,
  deleteWorkout,
  deleteWorkoutPlan,
  deleteInjection,
  deleteMedication,
  deleteSymptoms,
  listInjections,
  listMedications,
  listSymptoms,
  putInjection,
  putMedication,
  upsertSymptoms,
  undoLastWater,
  resetDbForTests,
  saveCustomUnits,
  saveProfile,
  setFavorite,
  splitLegacyMeasurements,
  upsertSteps,
  upsertWaist,
  deleteRecipe,
  listRecipes,
  putRecipe,
  type Recipe,
  type FoodLogEntry,
} from './db.ts';
import { waterGoal } from '../lib/water.ts';
import { applyMealOrder, defaultMealSlots } from '../lib/mealSlots.ts';

afterEach(async () => {
  await resetDbForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = () => {
      resolve();
    };
  });
});

/** Skapar en databas med v2-schemat (kombinerade mätningar) och fyller den med data. */
async function createV2Database(measurements: Record<string, unknown>[]): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const raw = req.result;
      const weights = raw.createObjectStore('weights', { keyPath: 'id' });
      weights.createIndex('by-date', 'date');
      const photos = raw.createObjectStore('photos', { keyPath: 'id' });
      photos.createIndex('by-date', 'date');
      raw.createObjectStore('settings');
      const profile = raw.createObjectStore('profile');
      profile.put(
        { startDate: '2026-01-01', startWeightKg: 90, heightCm: 180, goalWeightKg: 80 },
        'current',
      );
      for (const m of measurements) weights.put(m);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('open failed'));
    };
  });
  db.close();
}

/** Skapar en databas med v1-schemat, precis som den första versionen av appen gjorde. */
async function createV1Database(): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const raw = req.result;
      const weights = raw.createObjectStore('weights', { keyPath: 'id' });
      weights.createIndex('by-date', 'date');
      const photos = raw.createObjectStore('photos', { keyPath: 'id' });
      photos.createIndex('by-date', 'date');
      raw.createObjectStore('settings');
      weights.put({ id: 'gammal', date: '2026-01-01', weightKg: 82.4, createdAt: 1 });
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('open failed'));
    };
  });
  db.close();
}

/** Skapar en databas med v3-schemat (före matloggningen). */
async function createV3Database(): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const raw = req.result;
      const weights = raw.createObjectStore('weights', { keyPath: 'id' });
      weights.createIndex('by-date', 'date');
      const photos = raw.createObjectStore('photos', { keyPath: 'id' });
      photos.createIndex('by-date', 'date');
      raw.createObjectStore('settings');
      raw.createObjectStore('profile');
      raw.createObjectStore('waist', { keyPath: 'date' });
      const steps = raw.createObjectStore('steps', { keyPath: 'date' });
      weights.put({ id: 'a', date: '2026-01-01', weightKg: 90, createdAt: 1 });
      steps.put({ date: '2026-01-01', steps: 5000, createdAt: 1 });
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('open failed'));
    };
  });
  db.close();
}

/** Skapar en databas med v6-schemat (före enheter) med mat i det gamla formatet. */
async function createV6Database(data: {
  foods: Record<string, unknown>[];
  meals: Record<string, unknown>[];
  foodLog: Record<string, unknown>[];
  profile?: Record<string, unknown>;
  weights?: Record<string, unknown>[];
  settings?: Record<string, unknown>;
}): Promise<void> {
  const raw = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 6);
    req.onupgradeneeded = () => {
      const db = req.result;
      const weights = db.createObjectStore('weights', { keyPath: 'id' });
      weights.createIndex('by-date', 'date');
      const photos = db.createObjectStore('photos', { keyPath: 'id' });
      photos.createIndex('by-date', 'date');
      db.createObjectStore('settings');
      db.createObjectStore('profile');
      db.createObjectStore('waist', { keyPath: 'date' });
      db.createObjectStore('steps', { keyPath: 'date' });
      const foods = db.createObjectStore('foods', { keyPath: 'id' });
      foods.createIndex('by-ean', 'ean');
      const meals = db.createObjectStore('meals', { keyPath: 'id' });
      const foodLog = db.createObjectStore('foodLog', { keyPath: 'id' });
      foodLog.createIndex('by-date', 'date');
      db.createObjectStore('favorites', { keyPath: 'foodId' });
      const water = db.createObjectStore('water', { keyPath: 'id' });
      water.createIndex('by-date', 'date');
      const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
      workouts.createIndex('by-date', 'date');
      db.createObjectStore('workoutPlans', { keyPath: 'id' });
      db.createObjectStore('medications', { keyPath: 'id' });
      const injections = db.createObjectStore('injections', { keyPath: 'id' });
      injections.createIndex('by-date', 'date');
      db.createObjectStore('symptoms', { keyPath: 'date' });
      for (const f of data.foods) foods.put(f);
      for (const m of data.meals) meals.put(m);
      for (const e of data.foodLog) foodLog.put(e);
      if (data.profile) req.transaction?.objectStore('profile').put(data.profile, 'current');
      for (const w of data.weights ?? []) weights.put(w);
      const settings = req.transaction?.objectStore('settings');
      for (const [key, value] of Object.entries(data.settings ?? {})) settings?.put(value, key);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('open failed'));
    };
  });
  raw.close();
}

describe('db', () => {
  it('skapar alla object stores', async () => {
    const db = await getDb();
    expect([...db.objectStoreNames].sort()).toEqual([
      'favorites',
      'foodLog',
      'foodOverrides',
      'foodUnits',
      'foods',
      'hiddenFoods',
      'injections',
      'mealSlots',
      'meals',
      'medications',
      'milestones',
      'photoSessions',
      'photos',
      'profile',
      'recipes',
      'settings',
      'steps',
      'supplementLog',
      'supplements',
      'symptoms',
      'waist',
      'water',
      'weights',
      'workoutPlans',
      'workouts',
    ]);
  });

  it('dolt i matsökningen: sparas per nyckel och visas igen när posten tas bort', async () => {
    expect(hiddenKey('livsmedel', 'lv:1')).toBe('livsmedel:lv:1');
    await putHiddenFoods([
      { key: 'kategori:godis', kind: 'kategori', value: 'godis', createdAt: 2 },
      { key: 'livsmedel:lv:1', kind: 'livsmedel', value: 'lv:1', name: 'Bröd', createdAt: 1 },
    ]);
    expect((await listHiddenFoods()).map((h) => h.key)).toEqual([
      'livsmedel:lv:1',
      'kategori:godis',
    ]);
    await deleteHiddenFoods(['livsmedel:lv:1']);
    expect((await listHiddenFoods()).map((h) => h.key)).toEqual(['kategori:godis']);
  });

  it('borttaget eget livsmedel och måltid finns kvar för loggarna men syns inte', async () => {
    const per100 = { kcal: 100, proteinG: 1, carbsG: 2, fatG: 3 };
    const food = {
      id: 'egen:k',
      name: 'Knäcke',
      source: 'egen' as const,
      per100,
      ean: '73100005',
      fiberG: 15,
      createdAt: 1,
    };
    await putFood(food);
    await putMeal({ id: 'm', name: 'Frukost', items: [], ean: '73100006', createdAt: 1 });
    await setFavorite('egen:k', true, 2);
    await deleteFood('egen:k', 50);
    await deleteMeal('m', 51);
    expect(await listFoods()).toEqual([]);
    expect(await listMeals()).toEqual([]);
    expect(await findFoodByEan('73100005')).toBeNull();
    expect(await findMealByEan('73100006')).toBeNull();
    expect(await listFavorites()).toEqual([]);
    expect(await listAllFoods()).toEqual([{ ...food, deletedAt: 50, updatedAt: 50 }]);
    expect((await listAllMeals()).map((m) => m.deletedAt)).toEqual([51]);
    // Säkerhetskopian tar med dem; Ångra visar dem igen.
    const backup = await readSnapshot();
    expect(backup.foods.map((f) => f.id)).toEqual(['egen:k']);
    await restoreFood({ ...food, deletedAt: 50 }, 60);
    await restoreMeal({ id: 'm', name: 'Frukost', items: [], createdAt: 1 }, 61);
    expect(await listFoods()).toEqual([{ ...food, updatedAt: 60 }]);
    expect((await listMeals()).map((m) => m.updatedAt)).toEqual([61]);
    // Ångra är nyare än borttagningen: en säkerhetskopia med borttagningen tar inte bort dem igen.
    await applySnapshot(backup, 'merge');
    expect((await listFoods()).map((f) => f.id)).toEqual(['egen:k']);
    expect((await listMeals()).map((m) => m.id)).toEqual(['m']);
  });

  it('egna näringsvärden: sparas per livsmedel, tomma värden tar bort posten', async () => {
    await putFoodOverride({
      foodId: 'off:7310865004703',
      ean: '7310865004703',
      name: 'Havregryn',
      values: { fiberG: 10 },
      createdAt: 1,
    });
    expect((await getFoodOverride('off:7310865004703'))?.values).toEqual({ fiberG: 10 });
    await putFoodOverride({ foodId: 'lv:1', name: 'Äpple', values: {}, createdAt: 1 });
    expect(await listFoodOverrides()).toHaveLength(1);
    await putFoodOverride({
      foodId: 'off:7310865004703',
      name: 'Havregryn',
      values: {},
      createdAt: 1,
    });
    expect(await listFoodOverrides()).toEqual([]);
  });

  it('uppdaterar flera loggposter i en transaktion', async () => {
    const base = {
      meal: 'frukost' as const,
      foodId: 'lv:1',
      name: 'Äpple',
      amount: 1,
      unit: 'st',
      grams: 150,
      per100: { kcal: 52, proteinG: 0.3, carbsG: 11, fatG: 0.2 },
      createdAt: 1,
    };
    await putFoodLog({ ...base, id: 'a', date: '2026-09-29' });
    await putFoodLog({ ...base, id: 'b', date: '2026-09-30' });
    const per100 = { kcal: 55, proteinG: 0.3, carbsG: 12, fatG: 0.2 };
    await putFoodLogEntries([
      { ...base, id: 'a', date: '2026-09-29', per100, updatedAt: 2 },
      { ...base, id: 'b', date: '2026-09-30', per100, updatedAt: 2 },
    ]);
    expect((await listFoodLog()).map((e) => [e.id, e.per100.kcal, e.grams])).toEqual([
      ['a', 55, 150],
      ['b', 55, 150],
    ]);
  });

  it('migrerar v1 → senaste och behåller befintliga mätningar', async () => {
    await createV1Database();
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toContain('profile');
    expect(await listWeights()).toEqual([
      { id: 'gammal', date: '2026-01-01', weightKg: 82.4, createdAt: 1 },
    ]);
    expect(await listWaist()).toEqual([]);
    expect(await listSteps()).toEqual([]);
    expect(await getProfile()).toBeNull();
    expect(await listFoodLog()).toEqual([]);
  });

  it('migrerar v2 → v3: delar upp midja och steg i egna stores', async () => {
    await createV2Database([
      { id: 'a', date: '2026-01-01', weightKg: 90, createdAt: 1 },
      {
        id: 'b',
        date: '2026-01-02',
        weightKg: 89.6,
        waistCm: 100,
        steps: 4000,
        note: 'Morgon',
        createdAt: 2,
      },
      // Samma dag, registrerad senare: dess steg och midja vinner.
      { id: 'c', date: '2026-01-02', weightKg: 89.4, waistCm: 99.5, steps: 9000, createdAt: 5 },
      // Senare registrerad men utan steg: stegen från c behålls.
      { id: 'd', date: '2026-01-02', weightKg: 89.5, createdAt: 6 },
      { id: 'e', date: '2026-01-03', weightKg: 89.1, steps: 0, createdAt: 7, updatedAt: 9 },
    ]);

    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect(await listWeights()).toEqual([
      { id: 'a', date: '2026-01-01', weightKg: 90, createdAt: 1 },
      { id: 'b', date: '2026-01-02', weightKg: 89.6, note: 'Morgon', createdAt: 2 },
      { id: 'c', date: '2026-01-02', weightKg: 89.4, createdAt: 5 },
      { id: 'd', date: '2026-01-02', weightKg: 89.5, createdAt: 6 },
      { id: 'e', date: '2026-01-03', weightKg: 89.1, createdAt: 7, updatedAt: 9 },
    ]);
    expect(await listWaist()).toEqual([{ date: '2026-01-02', waistCm: 99.5, createdAt: 5 }]);
    expect(await listSteps()).toEqual([
      { date: '2026-01-02', steps: 9000, createdAt: 5 },
      { date: '2026-01-03', steps: 0, createdAt: 7, updatedAt: 9 },
    ]);
    // Profilen och indexen finns kvar.
    expect(await getProfile()).toMatchObject({ startWeightKg: 90 });
    expect(await db.getAllKeysFromIndex('weights', 'by-date', '2026-01-02')).toHaveLength(3);
  });

  it('migrerar en tom v2-databas', async () => {
    await createV2Database([]);
    expect(await listWeights()).toEqual([]);
    expect(await listSteps()).toEqual([]);
  });

  it('listar vikter sorterade på datum och sedan registreringstid', async () => {
    await putWeight({ id: 'c', date: '2026-02-01', weightKg: 80.0, createdAt: 3 });
    await putWeight({ id: 'b', date: '2026-02-01', weightKg: 80.2, createdAt: 2 });
    await putWeight({ id: 'a', date: '2026-01-01', weightKg: 81.5, createdAt: 1 });
    const list = await listWeights();
    expect(list.map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });

  it('uppdaterar och tar bort vikter', async () => {
    await putWeight({ id: 'a', date: '2026-01-01', weightKg: 81.5, createdAt: 1 });
    await putWeight({
      id: 'a',
      date: '2026-01-01',
      weightKg: 81.0,
      note: 'Efter löprunda',
      createdAt: 1,
      updatedAt: 2,
    });
    expect(await listWeights()).toMatchObject([{ weightKg: 81.0, note: 'Efter löprunda' }]);
    await deleteWeight('a');
    expect(await listWeights()).toEqual([]);
  });

  it('steg: ett värde per dag, skrivs över', async () => {
    await upsertSteps('2026-01-02', 4000, 10);
    await upsertSteps('2026-01-01', 7000, 11);
    await upsertSteps('2026-01-02', 9500, 12);
    expect(await listSteps()).toEqual([
      { date: '2026-01-01', steps: 7000, createdAt: 11 },
      { date: '2026-01-02', steps: 9500, createdAt: 10, updatedAt: 12 },
    ]);
  });

  it('midja: ett värde per dag, skrivs över och kan tas bort', async () => {
    await upsertWaist('2026-01-01', 95, 1);
    await upsertWaist('2026-01-01', 94.5, 2);
    await upsertWaist('2026-01-08', 94, 3);
    expect(await listWaist()).toEqual([
      { date: '2026-01-01', waistCm: 94.5, createdAt: 1, updatedAt: 2 },
      { date: '2026-01-08', waistCm: 94, createdAt: 3 },
    ]);
    await deleteWaist('2026-01-01');
    expect((await listWaist()).map((w) => w.date)).toEqual(['2026-01-08']);
  });

  it('äldsta posten räknas över alla stores', async () => {
    expect(await getOldestEntryTime()).toBeNull();
    await putWeight({ id: 'a', date: '2026-01-01', weightKg: 81.5, createdAt: 50 });
    await upsertSteps('2026-01-01', 7000, 20);
    await upsertWaist('2026-01-01', 90, 30);
    expect(await getOldestEntryTime()).toBe(20);
  });

  it('migrerar v2 → senaste i ett steg: lägger till matstores och behåller data', async () => {
    await createV2Database([
      { id: 'a', date: '2026-01-01', weightKg: 90, steps: 5000, createdAt: 1 },
    ]);
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect(await listWeights()).toEqual([
      { id: 'a', date: '2026-01-01', weightKg: 90, createdAt: 1 },
    ]);
    expect(await listSteps()).toEqual([{ date: '2026-01-01', steps: 5000, createdAt: 1 }]);
    expect(await listFoods()).toEqual([]);
    expect(await listMeals()).toEqual([]);
    expect(await listFavorites()).toEqual([]);
  });

  it('migrerar v3 → senaste: lägger till mat-, vatten- och träningsstores och behåller data', async () => {
    await createV3Database();
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toEqual(
      expect.arrayContaining([
        'foods',
        'meals',
        'foodLog',
        'favorites',
        'water',
        'workouts',
        'workoutPlans',
      ]),
    );
    expect(await listWeights()).toHaveLength(1);
    expect(await listSteps()).toEqual([{ date: '2026-01-01', steps: 5000, createdAt: 1 }]);
    expect(await listFoodLog()).toEqual([]);
  });

  it('migrerar v4 → v5: lägger till vatten och träning och behåller maten', async () => {
    await createV3Database();
    // Öppna som v4 med den riktiga koden vore att köra om v5-blocket; bygg v4 för hand.
    await resetDbForTests();
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 4);
      req.onupgradeneeded = () => {
        const db = req.result;
        const foods = db.createObjectStore('foods', { keyPath: 'id' });
        foods.createIndex('by-ean', 'ean');
        db.createObjectStore('meals', { keyPath: 'id' });
        const foodLog = db.createObjectStore('foodLog', { keyPath: 'id' });
        foodLog.createIndex('by-date', 'date');
        db.createObjectStore('favorites', { keyPath: 'foodId' });
        foods.put({ id: 'egen:x', name: 'X', source: 'egen', per100: {}, createdAt: 1 });
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    raw.close();
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect(await listFoods()).toHaveLength(1);
    expect(await listWeights()).toHaveLength(1);
    expect(await listWater()).toEqual([]);
    expect(await listWorkouts()).toEqual([]);
    expect(await listWorkoutPlans()).toEqual([]);
  });

  it('migrerar v5 → v6: lägger till GLP-1-stores och behåller vatten och träning', async () => {
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 5);
      req.onupgradeneeded = () => {
        const db = req.result;
        const weights = db.createObjectStore('weights', { keyPath: 'id' });
        weights.createIndex('by-date', 'date');
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('by-date', 'date');
        db.createObjectStore('settings');
        db.createObjectStore('profile');
        db.createObjectStore('waist', { keyPath: 'date' });
        db.createObjectStore('steps', { keyPath: 'date' });
        const foods = db.createObjectStore('foods', { keyPath: 'id' });
        foods.createIndex('by-ean', 'ean');
        db.createObjectStore('meals', { keyPath: 'id' });
        const foodLog = db.createObjectStore('foodLog', { keyPath: 'id' });
        foodLog.createIndex('by-date', 'date');
        db.createObjectStore('favorites', { keyPath: 'foodId' });
        const water = db.createObjectStore('water', { keyPath: 'id' });
        water.createIndex('by-date', 'date');
        const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
        workouts.createIndex('by-date', 'date');
        db.createObjectStore('workoutPlans', { keyPath: 'id' });
        weights.put({ id: 'a', date: '2026-01-01', weightKg: 90, createdAt: 1 });
        water.put({ id: 'v', date: '2026-01-01', ml: 250, createdAt: 2 });
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    raw.close();
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect(await listWeights()).toHaveLength(1);
    expect(await listWater()).toHaveLength(1);
    expect(await listMedications()).toEqual([]);
    expect(await listInjections()).toEqual([]);
    expect(await listSymptoms()).toEqual([]);
  });

  it('migrerar v6 → v7: portioner blir enheter, äldre loggar tolkas som gram', async () => {
    const per100 = { kcal: 380, proteinG: 7, carbsG: 50, fatG: 16 };
    await createV6Database({
      foods: [
        {
          id: 'egen:bulle',
          name: 'Bulle',
          source: 'egen',
          per100,
          portionG: 60,
          portionName: 'bulle',
          createdAt: 1,
        },
        {
          id: 'off:123',
          name: 'Flingor',
          source: 'openfoodfacts',
          per100,
          portionG: 30,
          portionName: 'portion',
          ean: '123',
          createdAt: 2,
        },
        { id: 'egen:x', name: 'Utan portion', source: 'egen', per100, createdAt: 3 },
      ],
      meals: [
        {
          id: 'm',
          name: 'Fika',
          items: [{ foodId: 'egen:bulle', name: 'Bulle', grams: 60, per100 }],
          createdAt: 4,
        },
      ],
      foodLog: [
        {
          id: 'gram',
          date: '2026-01-01',
          meal: 'lunch',
          foodId: 'lv:1',
          name: 'Pasta',
          grams: 250,
          per100,
          createdAt: 5,
        },
        {
          id: 'portion',
          date: '2026-01-01',
          meal: 'mellanmal',
          foodId: 'egen:bulle',
          name: 'Bulle',
          grams: 90,
          per100,
          portionName: 'bulle',
          portionCount: 1.5,
          createdAt: 6,
        },
      ],
    });
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);

    const foods = await listFoods();
    expect(foods).toEqual([
      { id: 'egen:bulle', name: 'Bulle', source: 'egen', per100, createdAt: 1 },
      {
        id: 'off:123',
        name: 'Flingor',
        source: 'openfoodfacts',
        per100,
        units: [{ name: 'portion', grams: 30, source: 'openfoodfacts' }],
        ean: '123',
        createdAt: 2,
      },
      { id: 'egen:x', name: 'Utan portion', source: 'egen', per100, createdAt: 3 },
    ]);
    expect(await listCustomUnits()).toEqual([
      { foodId: 'egen:bulle', units: [{ name: 'bulle', grams: 60, source: 'egen' }], createdAt: 1 },
    ]);
    const log = await listFoodLog();
    expect(log.map((e) => [e.id, e.amount, e.unit, e.grams])).toEqual([
      ['gram', 250, 'g', 250],
      ['portion', 1.5, 'bulle', 90],
    ]);
    expect(log[1]).not.toHaveProperty('portionName');
    expect(log[1]).not.toHaveProperty('portionCount');
    expect((await listMeals())[0]?.items).toEqual([
      { foodId: 'egen:bulle', name: 'Bulle', amount: 60, unit: 'g', grams: 60, per100 },
    ]);
  });

  it('dryckesmålet efter uppgradering: uträknat mål blir nytt standardmål, eget mål behålls', async () => {
    const base = { startDate: '2026-01-01', startWeightKg: 110, heightCm: 180, goalWeightKg: 90 };
    const weights = [{ id: 'w', date: '2026-09-01', weightKg: 110, createdAt: 1 }];
    // Gamla appen: 33 ml × 110 kg ≈ 3 600 ml, uträknat och aldrig sparat i profilen.
    await createV6Database({
      foods: [],
      meals: [],
      foodLog: [],
      weights,
      profile: { ...base, sex: 'man' },
    });
    const auto = await getProfile();
    expect(auto).not.toHaveProperty('waterGoalMl');
    expect(waterGoal({ profile: auto }).ml).toBe(2000);

    await resetDbForTests();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => {
        resolve();
      };
    });
    await createV6Database({
      foods: [],
      meals: [],
      foodLog: [],
      weights,
      profile: { ...base, sex: 'kvinna', waterGoalMl: 3600 },
    });
    const manual = await getProfile();
    expect(manual?.waterGoalMl).toBe(3600);
    expect(waterGoal({ profile: manual })).toMatchObject({ ml: 3600, source: 'egen' });
  });

  it('migrerar v7 → v8: lägger till milstolpar och behåller data', async () => {
    await createV6Database({ foods: [], meals: [], foodLog: [] });
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 7);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('foodUnits', { keyPath: 'foodId' });
        req.transaction
          ?.objectStore('weights')
          .put({ id: 'a', date: '2026-01-01', weightKg: 90, createdAt: 1 });
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    raw.close();
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect(await listWeights()).toHaveLength(1);
    expect(await listMilestones()).toEqual([]);
  });

  it('tillskott: hittas på streckkod, tagna doser ligger kvar när tillskottet tas bort', async () => {
    await putSupplement({
      id: 's1',
      name: 'Zink',
      form: 'tablett',
      amountPerDose: 1,
      nutrients: [{ key: 'zinc', amount: 15, unit: 'mg' }],
      schedule: 'dagligen',
      dosesPerDay: 1,
      ean: '73513537',
      createdAt: 1,
    });
    await putSupplementIntake({
      id: 's1:2026-01-02',
      date: '2026-01-02',
      supplementId: 's1',
      name: 'Zink',
      doses: 1,
      nutrients: [{ key: 'zinc', amount: 15, unit: 'mg' }],
      createdAt: 2,
    });
    expect((await findSupplementByEan('73513537'))?.name).toBe('Zink');
    expect(await findSupplementByEan('4006381333931')).toBeNull();
    await deleteSupplement('s1');
    expect(await listSupplements()).toEqual([]);
    expect(await listSupplementLog()).toHaveLength(1);
  });

  it('måltider hittas på streckkod', async () => {
    await putMeal({ id: 'm1', name: 'Matlåda', items: [], ean: '73513537', createdAt: 1 });
    expect((await findMealByEan('73513537'))?.name).toBe('Matlåda');
    expect(await findMealByEan('12345670')).toBeNull();
  });

  it('migrerar v9 → v10: lägger till tillskott och behåller data', async () => {
    await createV6Database({ foods: [], meals: [], foodLog: [] });
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 9);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('foodUnits', { keyPath: 'foodId' });
        db.createObjectStore('milestones', { keyPath: 'id' });
        const sessions = db.createObjectStore('photoSessions', { keyPath: 'id' });
        sessions.createIndex('by-date', 'date');
        req.transaction?.objectStore('photos').createIndex('by-session', 'sessionId');
        req.transaction
          ?.objectStore('weights')
          .put({ id: 'a', date: '2026-01-01', weightKg: 90, createdAt: 1 });
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    raw.close();
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect(await listWeights()).toHaveLength(1);
    expect(await listSupplements()).toEqual([]);
    expect(await listSupplementLog()).toEqual([]);
  });

  it('migrerar v10 → v11: lägger till recept och behåller matloggen', async () => {
    await createV6Database({
      foods: [],
      meals: [],
      foodLog: [
        {
          id: 'e1',
          date: '2026-01-01',
          meal: 'lunch',
          foodId: 'lv:1',
          name: 'Potatis',
          grams: 200,
          per100: { kcal: 80, proteinG: 2, carbsG: 17, fatG: 0.1 },
          createdAt: 1,
        },
      ],
    });
    // v6 → v10 med dåvarande scheman, sedan öppnar appen v11.
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 10);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('foodUnits', { keyPath: 'foodId' });
        db.createObjectStore('milestones', { keyPath: 'id' });
        const sessions = db.createObjectStore('photoSessions', { keyPath: 'id' });
        sessions.createIndex('by-date', 'date');
        req.transaction?.objectStore('photos').createIndex('by-session', 'sessionId');
        const supplements = db.createObjectStore('supplements', { keyPath: 'id' });
        supplements.createIndex('by-ean', 'ean');
        const supplementLog = db.createObjectStore('supplementLog', { keyPath: 'id' });
        supplementLog.createIndex('by-date', 'date');
        // Matloggen i v7-format (mängd + enhet), som migreringen till v7 skulle ha gjort.
        req.transaction?.objectStore('foodLog').put({
          id: 'e1',
          date: '2026-01-01',
          meal: 'lunch',
          foodId: 'lv:1',
          name: 'Potatis',
          amount: 200,
          unit: 'g',
          grams: 200,
          per100: { kcal: 80, proteinG: 2, carbsG: 17, fatG: 0.1 },
          createdAt: 1,
        });
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    raw.close();
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect(await listRecipes()).toEqual([]);
    expect((await listFoodLog()).map((e) => e.name)).toEqual(['Potatis']);
  });

  it('migrerar v11 → v12: tar bort profilens calorieMode och behåller resten', async () => {
    const profile = {
      startWeightKg: 90,
      heightCm: 180,
      goalWeightKg: 80,
      startDate: '2026-01-01',
      proteinFactor: 1.8,
      calorieMode: 'vecka',
      updatedAt: 1,
    };
    await createV6Database({ foods: [], meals: [], foodLog: [], profile });
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    const migrated = await getProfile();
    expect(migrated).not.toHaveProperty('calorieMode');
    expect(migrated).toEqual({ ...profile, calorieMode: undefined });
  });

  it('migrerar v13 → v14: rensar Föreslås dolda förslag och behåller övriga inställningar', async () => {
    await createV6Database({
      foods: [],
      meals: [],
      foodLog: [],
      settings: {
        [SETTING_PREFERENCES]: {
          trendHero: false,
          claimsHidden: ['energisnal'],
          suggestionsHidden: [{ key: 'lv:1', name: 'Kvarg' }],
        },
        [SETTING_LAST_EXPORT]: 123,
      },
    });
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect(DB_VERSION).toBe(16);
    expect(await getSetting(SETTING_PREFERENCES)).toEqual({
      trendHero: false,
      claimsHidden: ['energisnal'],
    });
    expect(await getSetting(SETTING_LAST_EXPORT)).toBe(123);
  });

  describe('egna måltider (v15)', () => {
    /** Lokal tid 2026-09-27 hh:mm som ms. */
    const at = (h: number, m = 0) => new Date(2026, 8, 27, h, m).getTime();
    const legacy = (id: string, meal: string, createdAt: number) => ({
      id,
      date: '2026-09-27',
      meal,
      foodId: 'lv:1',
      name: 'Havregryn',
      grams: 60,
      per100: { kcal: 370, proteinG: 13, carbsG: 59, fatG: 7 },
      createdAt,
    });

    it('migrerar v14 → v15: standardmåltider, Mellanmål fördelas efter loggtid', async () => {
      await createV6Database({
        foods: [],
        meals: [],
        foodLog: [
          legacy('f', 'frukost', at(7, 5)),
          legacy('l', 'lunch', at(12)),
          legacy('d', 'middag', at(18, 30)),
          legacy('fm', 'mellanmal', at(9, 40)),
          legacy('em', 'mellanmal', at(15, 20)),
          legacy('sen', 'mellanmal', at(13, 40)),
          legacy('kv', 'mellanmal', at(22, 10)),
          // Mitt i natten: närmast Kvällsmål (21:00) räknat runt dygnet.
          legacy('natt', 'mellanmal', at(3)),
        ],
      });
      expect((await listMealSlots()).map((m) => `${m.name} ${m.time} ${m.kind}`)).toEqual([
        'Frukost 07:00 huvudmal',
        'Förmiddagsmellanmål 10:00 mellanmal',
        'Lunch 12:00 huvudmal',
        'Eftermiddagsmellanmål 15:00 mellanmal',
        'Middag 18:00 huvudmal',
        'Kvällsmål 21:00 mellanmal',
      ]);
      const log = await listFoodLog();
      expect(Object.fromEntries(log.map((e) => [e.id, e.meal]))).toEqual({
        f: 'frukost',
        l: 'lunch',
        d: 'middag',
        fm: 'formiddag',
        em: 'eftermiddag',
        sen: 'eftermiddag',
        kv: 'kvall',
        natt: 'kvall',
      });
      // v7-migreringen (gram → mängd och enhet) har inte skrivits över.
      expect(log.find((e) => e.id === 'em')).toMatchObject({ amount: 60, unit: 'g', grams: 60 });
    });

    it('en ny databas får standardmåltiderna', async () => {
      expect((await listMealSlots()).map((m) => m.id)).toEqual([
        'frukost',
        'formiddag',
        'lunch',
        'eftermiddag',
        'middag',
        'kvall',
      ]);
    });

    it('borttagen måltid: posterna flyttas till vald måltid och Ångra lägger tillbaka dem', async () => {
      const entry = (id: string, meal: string): FoodLogEntry => ({
        ...legacy(id, meal, at(21)),
        amount: 60,
        unit: 'g',
      });
      await putFoodLog(entry('a', 'kvall'));
      await putFoodLog(entry('b', 'kvall'));
      await putFoodLog(entry('c', 'middag'));
      expect((await countFoodLogByMeal()).get('kvall')).toBe(2);

      const originals = await deleteMealSlot('kvall', 'eftermiddag', 99);
      expect(originals.map((e) => e.id).sort()).toEqual(['a', 'b']);
      expect((await listMealSlots()).map((m) => m.id)).not.toContain('kvall');
      const after = await listFoodLog();
      expect(
        after
          .filter((e) => e.meal === 'eftermiddag')
          .map((e) => e.id)
          .sort(),
      ).toEqual(['a', 'b']);
      expect(after.find((e) => e.id === 'a')?.updatedAt).toBe(99);
      expect(after.find((e) => e.id === 'c')?.meal).toBe('middag');

      // Ångra.
      const slot = defaultMealSlots().find((m) => m.id === 'kvall');
      if (slot) await putMealSlots([slot]);
      await putFoodLogEntries(originals);
      expect((await listFoodLog()).filter((e) => e.meal === 'kvall')).toHaveLength(2);
    });

    it('kan inte flytta till en måltid som inte finns', async () => {
      await expect(deleteMealSlot('kvall', 'saknas')).rejects.toThrow();
      expect((await listMealSlots()).map((m) => m.id)).toContain('kvall');
    });

    it('ny ordning och nya namn sparas', async () => {
      const ids = ['lunch', 'frukost', 'formiddag', 'eftermiddag', 'middag', 'kvall'];
      const reordered = applyMealOrder(await listMealSlots(), ids, 5).map((m) =>
        m.id === 'kvall' ? { ...m, name: 'Nattmacka', updatedAt: 5 } : m,
      );
      // Bara de som ändrats sparas.
      const changed = reordered.filter((m) => m.updatedAt === 5);
      expect(changed.map((m) => m.id)).toEqual(['lunch', 'frukost', 'formiddag', 'kvall']);
      await putMealSlots(changed);
      expect((await listMealSlots()).map((m) => m.name)).toEqual([
        'Lunch',
        'Frukost',
        'Förmiddagsmellanmål',
        'Eftermiddagsmellanmål',
        'Middag',
        'Nattmacka',
      ]);
    });
  });

  it('migrerar v13 → v14 utan sparade inställningar', async () => {
    await createV6Database({ foods: [], meals: [], foodLog: [] });
    await getDb();
    expect(await getSetting(SETTING_PREFERENCES)).toBeUndefined();
  });

  it('recept: sparas i namnordning, borttagning tar favorit och egna enheter', async () => {
    const recipe: Recipe = {
      id: 'r1',
      name: 'Linsgryta',
      items: [
        {
          foodId: 'lv:3',
          name: 'Linser',
          amount: 500,
          unit: 'g',
          grams: 500,
          per100: { kcal: 110, proteinG: 8, carbsG: 16, fatG: 0.5 },
        },
      ],
      servings: 6,
      createdAt: 1,
    };
    await putRecipe(recipe);
    await putRecipe({ ...recipe, id: 'r2', name: 'Chili' });
    await setFavorite('recept:r1', true, 2);
    await saveCustomUnits('recept:r1', [{ name: 'burk', grams: 400, source: 'egen' }]);
    expect((await listRecipes()).map((r) => r.name)).toEqual(['Chili', 'Linsgryta']);
    await deleteRecipe('r1');
    expect((await listRecipes()).map((r) => r.id)).toEqual(['r2']);
    expect(await listFavorites()).toEqual([]);
    expect(await listCustomUnits()).toEqual([]);
  });

  it('recept: en ändring av receptet ändrar inte redan loggade portioner', async () => {
    const recipe: Recipe = {
      id: 'r1',
      name: 'Gryta',
      items: [
        {
          foodId: 'lv:3',
          name: 'Linser',
          amount: 600,
          unit: 'g',
          grams: 600,
          per100: { kcal: 100, proteinG: 8, carbsG: 16, fatG: 0.5 },
        },
      ],
      servings: 6,
      createdAt: 1,
    };
    await putRecipe(recipe);
    const logged = {
      id: 'e1',
      date: '2026-09-24',
      meal: 'middag' as const,
      foodId: 'recept:r1',
      name: 'Gryta',
      amount: 1,
      unit: 'portion',
      grams: 100,
      per100: { kcal: 100, proteinG: 8, carbsG: 16, fatG: 0.5 },
      recipe: { yieldG: 600, items: recipe.items },
      createdAt: 2,
    };
    await putFoodLog(logged);
    await putRecipe({
      ...recipe,
      items: recipe.items.map((i) => ({ ...i, grams: 1200, amount: 1200 })),
      updatedAt: 3,
    });
    expect(await listFoodLog()).toEqual([logged]);
  });

  it('milstolpar sparas en gång – en sparad skrivs aldrig över', async () => {
    await addMilestones([{ id: 'kg-1', date: '2026-01-05', createdAt: 1 }]);
    await addMilestones([
      { id: 'kg-1', date: '2026-02-01', createdAt: 2 },
      { id: 'dagar-7', date: '2026-01-03', createdAt: 2 },
    ]);
    expect(await listMilestones()).toEqual([
      { id: 'dagar-7', date: '2026-01-03', createdAt: 2 },
      { id: 'kg-1', date: '2026-01-05', createdAt: 1 },
    ]);
  });

  it('meddelar ändringar efter sparningar som kan ge milstolpar', async () => {
    let calls = 0;
    const off = onDataChange(() => {
      calls += 1;
    });
    await putWeight({ id: 'a', date: '2026-01-01', weightKg: 90, createdAt: 1 });
    await addWater('2026-01-01', 250);
    await upsertSteps('2026-01-01', 5000);
    expect(calls).toBe(3);
    off();
    await putWeight({ id: 'b', date: '2026-01-02', weightKg: 89, createdAt: 2 });
    expect(calls).toBe(3);
  });

  it('egna enheter: sparas per livsmedel, tas bort med livsmedlet och påverkar inte loggen', async () => {
    const per100 = { kcal: 140, proteinG: 12, carbsG: 0, fatG: 10 };
    await saveCustomUnits('lv:2205', [{ name: 'st', grams: 60, source: 'egen' }], 1);
    await putFoodLog({
      id: 'e',
      date: '2026-01-01',
      meal: 'frukost',
      foodId: 'lv:2205',
      name: 'Ägg',
      amount: 2,
      unit: 'st',
      grams: 120,
      per100,
      createdAt: 2,
    });
    // Enheten ändras senare – den loggade posten behåller sina gram.
    await saveCustomUnits('lv:2205', [{ name: 'st', grams: 70, source: 'egen' }], 3);
    expect(await listCustomUnits()).toEqual([
      {
        foodId: 'lv:2205',
        units: [{ name: 'st', grams: 70, source: 'egen' }],
        createdAt: 1,
        updatedAt: 3,
      },
    ]);
    expect((await listFoodLog())[0]).toMatchObject({ amount: 2, unit: 'st', grams: 120 });

    await saveCustomUnits('lv:2205', []);
    expect(await listCustomUnits()).toEqual([]);

    await putFood({ id: 'egen:y', name: 'Y', source: 'egen', per100, createdAt: 4 });
    await saveCustomUnits('egen:y', [{ name: 'burk', grams: 200, source: 'egen' }]);
    await saveCustomUnits('maltid:m', [{ name: 'halv', grams: 150, source: 'egen' }]);
    await deleteFood('egen:y');
    await deleteMeal('m');
    expect(await listCustomUnits()).toEqual([]);
  });

  it('GLP-1: läkemedel, injektioner och mående sparas, listas och tas bort', async () => {
    await putMedication({
      id: 'm',
      name: 'Wegovy',
      frequency: 'vecka',
      weekday: 0,
      time: '08:00',
      steps: [{ date: '2026-09-14', doseMg: 0.25 }],
      createdAt: 1,
    });
    const base = { medicationId: 'm', medicationName: 'Wegovy', doseMg: 0.25 };
    await putInjection({ id: 'b', date: '2026-09-21', ...base, createdAt: 3 });
    await putInjection({ id: 'a', date: '2026-09-14', ...base, site: 'buk-vanster', createdAt: 2 });
    expect((await listInjections()).map((i) => i.id)).toEqual(['a', 'b']);
    await upsertSymptoms('2026-09-15', { appetite: 2, sideEffects: ['Illamående'] }, 10);
    await upsertSymptoms('2026-09-15', { sideEffects: ['Trötthet'] }, 20);
    expect(await listSymptoms()).toEqual([
      { date: '2026-09-15', sideEffects: ['Trötthet'], createdAt: 10, updatedAt: 20 },
    ]);
    expect(await getOldestEntryTime()).toBe(1);
    // Borttaget läkemedel lämnar loggade doser kvar.
    await deleteMedication('m');
    expect(await listMedications()).toEqual([]);
    expect(await listInjections()).toHaveLength(2);
    await deleteInjection('a');
    await deleteSymptoms('2026-09-15');
    expect((await listInjections()).map((i) => i.id)).toEqual(['b']);
    expect(await listSymptoms()).toEqual([]);
  });

  it('vatten: flera poster per dag, ångra tar bort dagens senaste', async () => {
    await addWater('2026-09-25', 250, 1);
    await addWater('2026-09-25', 500, 3);
    await addWater('2026-09-24', 330, 5);
    expect((await listWater()).map((w) => [w.date, w.ml])).toEqual([
      ['2026-09-24', 330],
      ['2026-09-25', 250],
      ['2026-09-25', 500],
    ]);
    expect((await undoLastWater('2026-09-25'))?.ml).toBe(500);
    expect((await listWater()).map((w) => w.ml)).toEqual([330, 250]);
    expect(await undoLastWater('2026-09-23')).toBeNull();
    // Samma millisekund: ordningen behålls ändå.
    await addWater('2026-09-26', 100, 50);
    await addWater('2026-09-26', 200, 50);
    expect((await undoLastWater('2026-09-26'))?.ml).toBe(200);
    expect(await getOldestEntryTime()).toBe(1);
  });

  it('pass och scheman: sparas, listas och tas bort', async () => {
    await putWorkoutPlan({
      id: 'p',
      type: 'Löpning',
      weekdays: [0, 2, 4],
      time: '07:00',
      durationMin: 30,
      startDate: '2026-09-14',
      createdAt: 1,
    });
    await putWorkout({
      id: 'b',
      date: '2026-09-20',
      type: 'Yoga',
      durationMin: 20,
      status: 'planerad',
      createdAt: 3,
    });
    await putWorkout({
      id: 'p:2026-09-14',
      date: '2026-09-14',
      type: 'Löpning',
      durationMin: 35,
      status: 'genomford',
      planId: 'p',
      createdAt: 4,
    });
    expect((await listWorkouts()).map((w) => w.id)).toEqual(['p:2026-09-14', 'b']);
    expect((await listWorkoutPlans()).map((p) => p.id)).toEqual(['p']);
    await deleteWorkout('b');
    await deleteWorkoutPlan('p');
    expect((await listWorkouts()).map((w) => w.id)).toEqual(['p:2026-09-14']);
    expect(await listWorkoutPlans()).toEqual([]);
  });

  it('matlogg: sparas, listas i datumordning och tas bort', async () => {
    const per100 = { kcal: 100, proteinG: 1, carbsG: 2, fatG: 3 };
    const base = {
      foodId: 'lv:1',
      name: 'Test',
      amount: 100,
      unit: 'g',
      grams: 100,
      per100,
      meal: 'lunch' as const,
    };
    await putFoodLog({ ...base, id: 'b', date: '2026-01-02', createdAt: 1 });
    await putFoodLog({ ...base, id: 'a', date: '2026-01-01', createdAt: 3 });
    await putFoodLog({ ...base, id: 'c', date: '2026-01-01', createdAt: 2 });
    expect((await listFoodLog()).map((e) => e.id)).toEqual(['c', 'a', 'b']);
    await deleteFoodLog('c');
    expect((await listFoodLog()).map((e) => e.id)).toEqual(['a', 'b']);
    expect(await getOldestEntryTime()).toBe(1);
  });

  it('livsmedel: hittas på streckkod, egna går före cachade', async () => {
    const per100 = { kcal: 100, proteinG: 1, carbsG: 2, fatG: 3 };
    await putFood({
      id: 'off:73100',
      name: 'Cachad',
      source: 'openfoodfacts',
      ean: '73100',
      per100,
      createdAt: 1,
    });
    expect((await findFoodByEan('73100'))?.id).toBe('off:73100');
    await putFood({
      id: 'egen:x',
      name: 'Eget',
      source: 'egen',
      ean: '73100',
      per100,
      createdAt: 2,
    });
    await putFood({ id: 'egen:y', name: 'Utan kod', source: 'egen', per100, createdAt: 3 });
    expect((await findFoodByEan('73100'))?.id).toBe('egen:x');
    expect(await findFoodByEan('999')).toBeNull();
    expect((await listFoods()).map((f) => f.name)).toEqual(['Cachad', 'Eget', 'Utan kod']);

    // Borttagning tar även bort favoritmarkeringen.
    await setFavorite('egen:x', true, 5);
    await deleteFood('egen:x');
    expect(await listFavorites()).toEqual([]);
  });

  it('måltider och favoriter', async () => {
    await putMeal({ id: 'm', name: 'Gröt', items: [], createdAt: 1 });
    await setFavorite('maltid:m', true, 2);
    await setFavorite('lv:1', true, 3);
    expect((await listFavorites()).map((f) => f.foodId)).toEqual(['maltid:m', 'lv:1']);
    await setFavorite('lv:1', false);
    await deleteMeal('m');
    expect(await listMeals()).toEqual([]);
    expect(await listFavorites()).toEqual([]);
  });

  it('sparar och läser profilen', async () => {
    const profile = {
      startDate: '2026-01-01',
      startWeightKg: 90,
      heightCm: 180,
      goalWeightKg: 80,
      goalDate: '2026-12-31',
      sex: 'man' as const,
      birthYear: 1980,
      activityLevel: 'latt' as const,
      ratePerWeekKg: 0.5,
    };
    await saveProfile(profile);
    expect(await getProfile()).toEqual(profile);
  });

  it('sparar, listar i datumordning och tar bort bilder', async () => {
    const blob = new Blob(['bild'], { type: 'image/webp' });
    const base = { blob, mimeType: 'image/webp', width: 1080, height: 810 };
    await putPhotoSession({ id: 's1', date: '2026-01-01', createdAt: 1 });
    await putPhotoSession({ id: 's2', date: '2026-03-01', weightKg: 84.2, createdAt: 2 });
    await putPhoto({
      ...base,
      id: 'b',
      sessionId: 's2',
      angle: 'profil',
      side: 'vanster',
      date: '2026-03-01',
      createdAt: 2,
    });
    await putPhoto({
      ...base,
      id: 'a',
      sessionId: 's1',
      angle: 'fram',
      date: '2026-01-01',
      createdAt: 3,
    });
    await putPhoto({
      ...base,
      id: 'c',
      sessionId: 's2',
      angle: 'fram',
      date: '2026-03-01',
      createdAt: 1,
    });

    const photos = await listPhotos();
    expect(photos.map((p) => p.id)).toEqual(['a', 'c', 'b']);
    expect(photos[2]).toMatchObject({ angle: 'profil', side: 'vanster', width: 1080, height: 810 });

    await deletePhoto('c');
    expect((await listPhotos()).map((p) => p.id)).toEqual(['a', 'b']);
    expect((await listPhotoSessions()).map((s) => s.id)).toEqual(['s1', 's2']);
    // Tillfällets sista bild: tillfället tas bort med den.
    await deletePhoto('b');
    expect((await listPhotoSessions()).map((s) => s.id)).toEqual(['s1']);
  });

  it('fototillfälle: nytt datum följer med till bilderna, borttagning tar bilderna', async () => {
    const blob = new Blob(['bild'], { type: 'image/webp' });
    await putPhotoSession({ id: 's1', date: '2026-01-01', createdAt: 1 });
    await putPhoto({
      id: 'a',
      sessionId: 's1',
      angle: 'fram',
      date: '2026-01-01',
      blob,
      mimeType: 'image/webp',
      createdAt: 1,
    });
    await putPhoto({
      id: 'b',
      sessionId: 's1',
      angle: 'okand',
      date: '2026-01-01',
      blob,
      mimeType: 'image/webp',
      createdAt: 2,
    });

    await putPhotoSession({
      id: 's1',
      date: '2026-01-05',
      note: 'Morgon',
      createdAt: 1,
      updatedAt: 5,
    });
    expect((await listPhotos()).map((p) => p.date)).toEqual(['2026-01-05', '2026-01-05']);

    await setPhotoAngle('b', 'profil', 'hoger');
    expect((await listPhotos()).find((p) => p.id === 'b')).toMatchObject({
      angle: 'profil',
      side: 'hoger',
    });
    await setPhotoAngle('b', 'fram', 'hoger');
    const b = (await listPhotos()).find((p) => p.id === 'b');
    expect(b).toMatchObject({ angle: 'fram' });
    expect(b?.side).toBeUndefined();
    expect(b?.updatedAt).toBeGreaterThan(0);

    await deletePhotoSession('s1');
    expect(await listPhotos()).toEqual([]);
    expect(await listPhotoSessions()).toEqual([]);
  });

  it('migrerar v8 → v9: bilder grupperas per datum med vinkel "ej angiven"', async () => {
    await createV6Database({ foods: [], meals: [], foodLog: [] });
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 8);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('foodUnits', { keyPath: 'foodId' });
        req.result.createObjectStore('milestones', { keyPath: 'id' });
        const photos = req.transaction?.objectStore('photos');
        const base = { blob, mimeType: 'image/webp', width: 3, height: 4 };
        photos?.put({ ...base, id: 'p1', date: '2026-01-01', createdAt: 1, weightKg: 90 });
        photos?.put({ ...base, id: 'p2', date: '2026-01-01', createdAt: 2, weightKg: 89.6 });
        photos?.put({ ...base, id: 'p3', date: '2026-02-01', createdAt: 3 });
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    raw.close();
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect(await listPhotoSessions()).toEqual([
      { id: 'migrerad:2026-01-01', date: '2026-01-01', weightKg: 89.6, createdAt: 1 },
      { id: 'migrerad:2026-02-01', date: '2026-02-01', createdAt: 3 },
    ]);
    const photos = await listPhotos();
    expect(photos.map((p) => [p.id, p.sessionId, p.angle])).toEqual([
      ['p1', 'migrerad:2026-01-01', 'okand'],
      ['p2', 'migrerad:2026-01-01', 'okand'],
      ['p3', 'migrerad:2026-02-01', 'okand'],
    ]);
    // Vikten ligger på tillfället, inte på bilden; bilden är oförändrad.
    expect(photos[0]).not.toHaveProperty('weightKg');
    expect(photos[0]).toMatchObject({ width: 3, height: 4, mimeType: 'image/webp' });
  });
});

describe('groupLegacyPhotos', () => {
  const blob = new Blob(['x']);
  const legacy = (id: string, date: string, createdAt: number, weightKg?: number) => ({
    id,
    date,
    blob,
    mimeType: 'image/webp',
    createdAt,
    ...(weightKg === undefined ? {} : { weightKg }),
  });

  it('ett tillfälle per datum; senast registrerade vikten vinner', () => {
    const result = groupLegacyPhotos([
      legacy('b', '2026-03-01', 5, 80),
      legacy('a', '2026-03-01', 2, 81),
      legacy('c', '2026-01-01', 9),
    ]);
    expect(result.sessions).toEqual([
      { id: 'migrerad:2026-01-01', date: '2026-01-01', createdAt: 9 },
      { id: 'migrerad:2026-03-01', date: '2026-03-01', weightKg: 80, createdAt: 2 },
    ]);
    // Bilderna behåller ordningen och får tillfälle och vinkel "ej angiven".
    expect(result.photos.map((p) => [p.id, p.sessionId, p.angle])).toEqual([
      ['b', 'migrerad:2026-03-01', 'okand'],
      ['a', 'migrerad:2026-03-01', 'okand'],
      ['c', 'migrerad:2026-01-01', 'okand'],
    ]);
    expect(result.photos.some((p) => 'weightKg' in p)).toBe(false);
  });

  it('samma datum ger samma tillfälles-id oavsett enhet', () => {
    expect(groupLegacyPhotos([legacy('x', '2026-05-05', 1)]).sessions[0]?.id).toBe(
      groupLegacyPhotos([legacy('y', '2026-05-05', 7)]).sessions[0]?.id,
    );
  });

  it('inga bilder ger inga tillfällen', () => {
    expect(groupLegacyPhotos([])).toEqual({ sessions: [], photos: [] });
  });
});

describe('splitLegacyMeasurements', () => {
  it('behåller alla vikter och tar senast registrerade midja/steg per dag', () => {
    const result = splitLegacyMeasurements([
      { id: 'b', date: '2026-01-01', weightKg: 80, steps: 9000, createdAt: 3 },
      { id: 'a', date: '2026-01-01', weightKg: 81, steps: 4000, waistCm: 90, createdAt: 1 },
    ]);
    expect(result.weights).toEqual([
      { id: 'b', date: '2026-01-01', weightKg: 80, createdAt: 3 },
      { id: 'a', date: '2026-01-01', weightKg: 81, createdAt: 1 },
    ]);
    expect(result.steps).toEqual([{ date: '2026-01-01', steps: 9000, createdAt: 3 }]);
    expect(result.waist).toEqual([{ date: '2026-01-01', waistCm: 90, createdAt: 1 }]);
  });
});
