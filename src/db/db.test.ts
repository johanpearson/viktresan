import { afterEach, describe, expect, it } from 'vitest';
import {
  DB_NAME,
  deleteMeasurement,
  getDb,
  getProfile,
  listMeasurements,
  putMeasurement,
  resetDbForTests,
  saveProfile,
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
    expect([...db.objectStoreNames].sort()).toEqual(['photos', 'profile', 'settings', 'weights']);
  });

  it('migrerar v1 → v2 och behåller befintliga mätningar', async () => {
    await createV1Database();
    const db = await getDb();
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames]).toContain('profile');
    expect(await listMeasurements()).toEqual([
      { id: 'gammal', date: '2026-01-01', weightKg: 82.4, createdAt: 1 },
    ]);
    expect(await getProfile()).toBeNull();
  });

  it('listar mätningar sorterade på datum och sedan registreringstid', async () => {
    await putMeasurement({ id: 'c', date: '2026-02-01', weightKg: 80.0, createdAt: 3 });
    await putMeasurement({ id: 'b', date: '2026-02-01', weightKg: 80.2, createdAt: 2 });
    await putMeasurement({ id: 'a', date: '2026-01-01', weightKg: 81.5, createdAt: 1 });
    const list = await listMeasurements();
    expect(list.map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });

  it('uppdaterar och tar bort mätningar', async () => {
    await putMeasurement({ id: 'a', date: '2026-01-01', weightKg: 81.5, createdAt: 1 });
    await putMeasurement({
      id: 'a',
      date: '2026-01-01',
      weightKg: 81.0,
      waistCm: 90,
      steps: 8000,
      note: 'Efter löprunda',
      createdAt: 1,
      updatedAt: 2,
    });
    expect(await listMeasurements()).toMatchObject([{ weightKg: 81.0, waistCm: 90, steps: 8000 }]);
    await deleteMeasurement('a');
    expect(await listMeasurements()).toEqual([]);
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
});
