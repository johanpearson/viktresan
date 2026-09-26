import { afterEach, describe, expect, it } from 'vitest';
import {
  addWater,
  DB_NAME,
  DB_VERSION,
  deleteFood,
  deleteFoodLog,
  deleteMeal,
  deletePhoto,
  deleteWaist,
  deleteWeight,
  getDb,
  getOldestEntryTime,
  getProfile,
  findFoodByEan,
  listFavorites,
  listCustomUnits,
  listFoodLog,
  listFoods,
  listMeals,
  listPhotos,
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
} from './db.ts';

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
      'foodUnits',
      'foods',
      'injections',
      'meals',
      'medications',
      'photos',
      'profile',
      'settings',
      'steps',
      'symptoms',
      'waist',
      'water',
      'weights',
      'workoutPlans',
      'workouts',
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
    await putPhoto({ ...base, id: 'b', date: '2026-03-01', createdAt: 2, weightKg: 84.2 });
    await putPhoto({ ...base, id: 'a', date: '2026-01-01', createdAt: 3 });
    await putPhoto({ ...base, id: 'c', date: '2026-03-01', createdAt: 1 });

    const photos = await listPhotos();
    expect(photos.map((p) => p.id)).toEqual(['a', 'c', 'b']);
    expect(photos[2]).toMatchObject({ weightKg: 84.2, width: 1080, height: 810 });

    await deletePhoto('c');
    expect((await listPhotos()).map((p) => p.id)).toEqual(['a', 'b']);
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
