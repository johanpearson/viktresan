import type { Page } from '@playwright/test';

/** Samlar CSP-överträdelser och konsolfel så att varje test kan kräva noll. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Lokalt datum ± dagar som YYYY-MM-DD, samma som appens todayIso(). */
export function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface SeedData {
  profile?: Record<string, unknown>;
  weights?: Record<string, unknown>[];
  /** Midjemått; nyckel = `date`. */
  waist?: Record<string, unknown>[];
  /** Steg; nyckel = `date`. */
  steps?: Record<string, unknown>[];
  /** Bilder; `bytes` blir en image/webp-Blob. */
  photos?: (Record<string, unknown> & { bytes: number[] })[];
  settings?: Record<string, unknown>;
  /** Egna livsmedel och cachade Open Food Facts-produkter. */
  foods?: Record<string, unknown>[];
  meals?: Record<string, unknown>[];
  foodLog?: Record<string, unknown>[];
  favorites?: Record<string, unknown>[];
  water?: Record<string, unknown>[];
  workouts?: Record<string, unknown>[];
  workoutPlans?: Record<string, unknown>[];
}

/**
 * Skriver data direkt i IndexedDB. Appen måste ha öppnat databasen först
 * (dvs. sidan ska vara laddad) så att schemat finns.
 */
export async function seed(page: Page, data: SeedData): Promise<void> {
  await page.evaluate(async (data) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('viktresan');
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    const tx = db.transaction(
      [
        'weights',
        'waist',
        'steps',
        'photos',
        'profile',
        'settings',
        'foods',
        'meals',
        'foodLog',
        'favorites',
        'water',
        'workouts',
        'workoutPlans',
      ],
      'readwrite',
    );
    if (data.profile) tx.objectStore('profile').put(data.profile, 'current');
    for (const w of data.weights ?? []) tx.objectStore('weights').put(w);
    for (const w of data.waist ?? []) tx.objectStore('waist').put(w);
    for (const s of data.steps ?? []) tx.objectStore('steps').put(s);
    for (const { bytes, ...p } of data.photos ?? []) {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/webp' });
      tx.objectStore('photos').put({ ...p, blob, mimeType: 'image/webp' });
    }
    for (const f of data.foods ?? []) tx.objectStore('foods').put(f);
    for (const m of data.meals ?? []) tx.objectStore('meals').put(m);
    for (const e of data.foodLog ?? []) tx.objectStore('foodLog').put(e);
    for (const f of data.favorites ?? []) tx.objectStore('favorites').put(f);
    for (const w of data.water ?? []) tx.objectStore('water').put(w);
    for (const w of data.workouts ?? []) tx.objectStore('workouts').put(w);
    for (const p of data.workoutPlans ?? []) tx.objectStore('workoutPlans').put(p);
    for (const [key, value] of Object.entries(data.settings ?? {})) {
      tx.objectStore('settings').put(value, key);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error('tx failed'));
      };
    });
    db.close();
  }, data);
}

export interface Dump {
  profile: unknown;
  weights: unknown[];
  waist: unknown[];
  steps: unknown[];
  photos: (Record<string, unknown> & { bytes: number[]; type: string })[];
  settings: Record<string, unknown>;
  foods: unknown[];
  meals: unknown[];
  foodLog: unknown[];
  favorites: unknown[];
  water: unknown[];
  workouts: unknown[];
  workoutPlans: unknown[];
}

/** Läser ut all data ur IndexedDB (bilder som byte-arrayer), sorterat på id. */
export async function dump(page: Page): Promise<Dump> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('viktresan');
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    const all = (store: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => {
          resolve(req.result);
        };
        req.onerror = () => {
          reject(req.error ?? new Error('getAll failed'));
        };
      });
    const keys = () =>
      new Promise<IDBValidKey[]>((resolve, reject) => {
        const req = db.transaction('settings').objectStore('settings').getAllKeys();
        req.onsuccess = () => {
          resolve(req.result);
        };
        req.onerror = () => {
          reject(req.error ?? new Error('getAllKeys failed'));
        };
      });
    const byId = (a: unknown, b: unknown) =>
      (a as { id: string }).id.localeCompare((b as { id: string }).id);
    const [
      profiles,
      weights,
      waist,
      steps,
      photos,
      settingValues,
      settingKeys,
      foods,
      meals,
      foodLog,
      favorites,
      water,
      workouts,
      workoutPlans,
    ] = await Promise.all([
      all('profile'),
      all('weights'),
      all('waist'),
      all('steps'),
      all('photos'),
      all('settings'),
      keys(),
      all('foods'),
      all('meals'),
      all('foodLog'),
      all('favorites'),
      all('water'),
      all('workouts'),
      all('workoutPlans'),
    ]);
    db.close();
    return {
      profile: profiles[0] ?? null,
      weights: weights.sort(byId),
      waist,
      steps,
      photos: await Promise.all(
        (photos as (Record<string, unknown> & { blob: Blob })[])
          .sort(byId)
          .map(async ({ blob, ...rest }) => ({
            ...rest,
            type: blob.type,
            bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
          })),
      ),
      settings: Object.fromEntries(settingKeys.map((k, i) => [k as string, settingValues[i]])),
      foods,
      meals,
      foodLog: foodLog.sort(byId),
      favorites,
      water: water.sort(byId),
      workouts: workouts.sort(byId),
      workoutPlans: workoutPlans.sort(byId),
    };
  });
}

/** Tömmer profil, mätningar (vikt, midja, steg), bilder, mat, vatten och träning – som en ny enhet. */
export async function wipe(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('viktresan');
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    const stores = [
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
    ];
    const tx = db.transaction(stores, 'readwrite');
    for (const store of stores) tx.objectStore(store).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => {
        resolve();
      };
    });
    db.close();
  });
}

/** Låtsas att appen går i bakgrunden och kommer tillbaka. */
export async function sendToBackground(page: Page): Promise<void> {
  await page.evaluate(() => {
    const set = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    set('hidden');
    set('visible');
  });
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export type LogType = 'vikt' | 'midja' | 'steg' | 'vatten' | 'traning';

/** Logga → trycker på rutan och väntar in panelen (bottom sheet) med formuläret. */
export async function openLog(page: Page, type: LogType): Promise<void> {
  const open = page.getByRole('dialog');
  if (await open.isVisible()) await open.getByRole('button', { name: 'Stäng' }).tap();
  await page.getByTestId(`log-tile-${type}`).tap();
  await page.getByRole('dialog').waitFor();
}
