import { afterEach, describe, expect, it } from 'vitest';
import {
  DB_NAME,
  DB_VERSION,
  deletePhoto,
  deleteWaist,
  deleteWeight,
  getDb,
  getOldestEntryTime,
  getProfile,
  listPhotos,
  listSteps,
  listWaist,
  listWeights,
  putPhoto,
  putWeight,
  resetDbForTests,
  saveProfile,
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

describe('db', () => {
  it('skapar alla object stores', async () => {
    const db = await getDb();
    expect([...db.objectStoreNames].sort()).toEqual([
      'photos',
      'profile',
      'settings',
      'steps',
      'waist',
      'weights',
    ]);
  });

  it('migrerar v1 → v3 och behåller befintliga mätningar', async () => {
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
    expect(db.version).toBe(3);
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

  it('sparar och läser profilen', async () => {
    const profile = {
      startDate: '2026-01-01',
      startWeightKg: 90,
      heightCm: 180,
      goalWeightKg: 80,
      goalDate: '2026-12-31',
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
