import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const DB_NAME = 'viktresan';
export const DB_VERSION = 2;

/**
 * En mätning. Datum lagras som ISO-sträng (YYYY-MM-DD) i lokal tid.
 * Flera mätningar samma dag är tillåtna; beräkningarna slår ihop dem.
 */
export interface Measurement {
  id: string;
  date: string;
  weightKg: number;
  waistCm?: number;
  steps?: number;
  note?: string;
  createdAt: number;
  updatedAt?: number;
}

/** Användarens profil. Det finns bara en, lagrad under nyckeln `PROFILE_KEY`. */
export interface Profile {
  startDate: string;
  startWeightKg: number;
  heightCm: number;
  goalWeightKg: number;
  goalDate?: string;
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
  /** Mätningar. Namnet är kvar från v1 då storen bara innehöll vikt. */
  weights: {
    key: string;
    value: Measurement;
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
  /** Sedan v2. */
  profile: {
    key: string;
    value: Profile;
  };
}

export type Database = IDBPDatabase<ViktresanDB>;

export const PROFILE_KEY = 'current';

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
      if (oldVersion < 2) {
        // v2: profil i egen store. Mätningar fick valfria fält (midja, steg),
        // vilket inte kräver någon datamigrering – befintliga poster är giltiga.
        db.createObjectStore('profile');
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

/** Lägger till eller ersätter en mätning (samma `id`). */
export async function putMeasurement(entry: Measurement): Promise<void> {
  const db = await getDb();
  await db.put('weights', entry);
}

export async function deleteMeasurement(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('weights', id);
}

/** Alla mätningar, äldst först (samma dag: i registreringsordning). */
export async function listMeasurements(): Promise<Measurement[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('weights', 'by-date');
  return all.sort((a, b) =>
    a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1,
  );
}

export async function getProfile(): Promise<Profile | null> {
  const db = await getDb();
  return (await db.get('profile', PROFILE_KEY)) ?? null;
}

export async function saveProfile(profile: Profile): Promise<void> {
  const db = await getDb();
  await db.put('profile', profile, PROFILE_KEY);
}
