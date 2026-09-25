import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const DB_NAME = 'viktresan';
export const DB_VERSION = 1;

/** En viktmätning. Datum lagras som ISO-sträng (YYYY-MM-DD) i lokal tid. */
export interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
  note?: string;
  createdAt: number;
}

/** Ett progressfoto. Bilden lagras som Blob direkt i IndexedDB. */
export interface PhotoEntry {
  id: string;
  date: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

export interface ViktresanDB extends DBSchema {
  weights: {
    key: string;
    value: WeightEntry;
    indexes: { 'by-date': string };
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
}

export type Database = IDBPDatabase<ViktresanDB>;

let dbPromise: Promise<Database> | null = null;

/**
 * Öppnar (och vid behov uppgraderar) databasen. Nya versioner läggs till som
 * nya `if (oldVersion < N)`-block – ändra aldrig ett befintligt block.
 */
export function getDb(): Promise<Database> {
  dbPromise ??= openDB<ViktresanDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const weights = db.createObjectStore('weights', { keyPath: 'id' });
        weights.createIndex('by-date', 'date');
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('by-date', 'date');
        db.createObjectStore('settings');
      }
    },
  });
  return dbPromise;
}

/** Endast för tester: stänger och glömmer den cachade anslutningen. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

export async function addWeight(entry: WeightEntry): Promise<void> {
  const db = await getDb();
  await db.put('weights', entry);
}

/** Alla viktmätningar, äldst först. */
export async function listWeights(): Promise<WeightEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex('weights', 'by-date');
}
