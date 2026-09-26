// @vitest-environment node
// Node-miljö: jsdoms Blob överlever inte structuredClone i fake-indexeddb, Nodes gör det.
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DB_NAME,
  applySnapshot,
  emptySnapshot,
  readSnapshot,
  resetDbForTests,
  saveProfile,
  type Favorite,
  type FoodLogEntry,
  type Injection,
  type Medication,
  type MilestoneRecord,
  type PhotoEntry,
  type PhotoSession,
  type Profile,
  type SavedMeal,
  type StoredFood,
  type Snapshot,
  type StepsEntry,
  type SymptomEntry,
  type WaistEntry,
  type CustomUnits,
  type WaterEntry,
  type WeightEntry,
  type Workout,
  type WorkoutPlan,
} from '../db/db.ts';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupError,
  backupFileName,
  createBackup,
  readBackup,
  summarizeBackup,
} from './backup.ts';

/** Snabbare nyckelhärledning i tester; produktionen använder 600 000. */
const ITERATIONS = 100_000;
const NOW = new Date('2026-09-25T08:30:00Z');

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

const profile: Profile = {
  startDate: '2026-01-01',
  startWeightKg: 92.5,
  heightCm: 181,
  goalWeightKg: 80,
  goalDate: '2026-12-31',
  sex: 'kvinna',
  birthYear: 1985,
  activityLevel: 'mattlig',
  ratePerWeekKg: 0.75,
};

const oats = { kcal: 370, proteinG: 13, carbsG: 59, fatG: 7 };

const foods: StoredFood[] = [
  {
    id: 'egen:gröt',
    name: 'Mormors gröt',
    source: 'egen',
    per100: { kcal: 90, proteinG: 3, carbsG: 15, fatG: 2 },
    createdAt: 4,
  },
  {
    id: 'off:7310865004703',
    name: 'Havregryn (Kungsörnen)',
    source: 'openfoodfacts',
    per100: oats,
    units: [{ name: 'portion', grams: 40, source: 'openfoodfacts' }],
    ean: '7310865004703',
    createdAt: 5,
    updatedAt: 6,
  },
];

const foodUnits: CustomUnits[] = [
  { foodId: 'egen:gröt', units: [{ name: 'tallrik', grams: 250, source: 'egen' }], createdAt: 4 },
];

const meals: SavedMeal[] = [
  {
    id: 'meal1',
    name: 'Frukostgröt',
    items: [
      {
        foodId: 'off:7310865004703',
        name: 'Havregryn',
        amount: 60,
        unit: 'g',
        grams: 60,
        per100: oats,
      },
      {
        foodId: 'lv:1',
        name: 'Mjölk',
        amount: 200,
        unit: 'g',
        grams: 200,
        per100: { kcal: 60, proteinG: 3.5, carbsG: 4.8, fatG: 3 },
      },
    ],
    createdAt: 7,
  },
];

const foodLog: FoodLogEntry[] = [
  {
    id: 'f1',
    date: '2026-01-08',
    meal: 'frukost',
    foodId: 'maltid:meal1',
    name: 'Frukostgröt',
    amount: 1,
    unit: 'portion',
    grams: 260,
    per100: { kcal: 131.5, proteinG: 5.7, carbsG: 17.3, fatG: 3.9 },
    createdAt: 8,
  },
  {
    id: 'f2',
    date: '2026-01-09',
    meal: 'mellanmal',
    foodId: 'lv:2',
    name: 'Banan',
    amount: 120,
    unit: 'g',
    grams: 120,
    per100: { kcal: 95, proteinG: 1.1, carbsG: 21, fatG: 0.3 },
    createdAt: 9,
    updatedAt: 10,
  },
];

const favorites: Favorite[] = [{ foodId: 'lv:2', createdAt: 11 }];

const foodData = { foods, meals, foodLog, favorites, foodUnits };

function st(name: string, grams: number) {
  return { name, grams, source: 'egen' };
}

/**
 * Samma mat i format före version 6 (portioner i stället för enheter). Uppgraderad
 * ska den bli exakt `foodData`.
 */
const legacyFoodData = {
  foods: [
    { ...(foods[0] as StoredFood), portionG: 250, portionName: 'tallrik' },
    { ...(foods[1] as StoredFood), units: undefined, portionG: 40 },
  ],
  meals: meals.map((m) => ({
    ...m,
    items: m.items.map((i) => ({
      foodId: i.foodId,
      name: i.name,
      grams: i.grams,
      per100: i.per100,
    })),
  })),
  foodLog: [
    {
      ...(foodLog[0] as FoodLogEntry),
      amount: undefined,
      unit: undefined,
      portionName: 'portion',
      portionCount: 1,
    },
    { ...(foodLog[1] as FoodLogEntry), amount: undefined, unit: undefined },
  ],
  favorites,
};

const water: WaterEntry[] = [
  { id: 'v1', date: '2026-01-08', ml: 250, createdAt: 12 },
  { id: 'v2', date: '2026-01-08', ml: 500, createdAt: 13, updatedAt: 14 },
];

const workoutPlans: WorkoutPlan[] = [
  {
    id: 'plan1',
    type: 'Löpning',
    weekdays: [0, 2, 4],
    time: '07:00',
    durationMin: 30,
    intensity: 'medel',
    startDate: '2026-01-05',
    createdAt: 15,
  },
];

const workouts: Workout[] = [
  {
    id: 'plan1:2026-01-07',
    date: '2026-01-07',
    time: '07:00',
    type: 'Löpning',
    durationMin: 35,
    intensity: 'hog',
    status: 'genomford',
    planId: 'plan1',
    createdAt: 16,
  },
  {
    id: 'w2',
    date: '2026-01-10',
    type: 'Klättring',
    durationMin: 90,
    note: 'Egen typ',
    status: 'hoppad',
    createdAt: 17,
    updatedAt: 18,
  },
];

const trainingData = { water, workouts, workoutPlans };

const medications: Medication[] = [
  {
    id: 'med1',
    name: 'Wegovy',
    frequency: 'vecka',
    weekday: 0,
    time: '08:00',
    steps: [
      { date: '2026-01-05', doseMg: 0.25 },
      { date: '2026-02-02', doseMg: 0.5 },
    ],
    createdAt: 19,
  },
  {
    id: 'med2',
    name: 'Eget läkemedel',
    frequency: 'dag',
    time: '21:30',
    steps: [{ date: '2026-01-01', doseMg: 0.6 }],
    endDate: '2026-01-04',
    createdAt: 20,
    updatedAt: 21,
  },
];

const injections: Injection[] = [
  {
    id: 'inj1',
    date: '2026-01-05',
    time: '08:10',
    medicationId: 'med1',
    medicationName: 'Wegovy',
    doseMg: 0.25,
    site: 'buk-vanster',
    createdAt: 22,
  },
  {
    id: 'inj2',
    date: '2026-01-12',
    medicationId: 'med1',
    medicationName: 'Wegovy',
    doseMg: 0.25,
    createdAt: 23,
    updatedAt: 24,
  },
];

const symptoms: SymptomEntry[] = [
  { date: '2026-01-06', appetite: 2, sideEffects: ['Illamående', 'Egen text'], createdAt: 25 },
  { date: '2026-01-07', sideEffects: ['Trötthet'], createdAt: 26 },
];

const glp1Data = { medications, injections, symptoms };

const milestones: MilestoneRecord[] = [
  { id: 'kg-1', date: '2026-01-08', createdAt: 60 },
  { id: 'dagar-7', date: '2026-01-15', createdAt: 61 },
];
const milestoneData = { milestones };

const weights: WeightEntry[] = [
  { id: 'm1', date: '2026-01-01', weightKg: 92.5, createdAt: 1 },
  {
    id: 'm2',
    date: '2026-01-08',
    weightKg: 91.2,
    note: 'Bra vecka – "å, ä, ö"',
    createdAt: 2,
    updatedAt: 5,
  },
  { id: 'm3', date: '2026-01-08', weightKg: 91.0, createdAt: 3 },
];

const waist: WaistEntry[] = [{ date: '2026-01-08', waistCm: 101, createdAt: 2, updatedAt: 5 }];

const steps: StepsEntry[] = [
  { date: '2026-01-07', steps: 12034, createdAt: 2 },
  { date: '2026-01-08', steps: 0, createdAt: 3 },
];

function photo(id: string, date: string, bytes: number[], extra: Partial<PhotoEntry> = {}) {
  return {
    id,
    sessionId: `s-${date}`,
    date,
    angle: 'fram',
    blob: new Blob([new Uint8Array(bytes)], { type: 'image/webp' }),
    mimeType: 'image/webp',
    createdAt: 10,
    ...extra,
  } satisfies PhotoEntry;
}

const photoSessions: PhotoSession[] = [
  { id: 's-2026-01-01', date: '2026-01-01', weightKg: 92.5, note: 'Första', createdAt: 10 },
  { id: 's-2026-02-01', date: '2026-02-01', createdAt: 10, updatedAt: 12 },
];

const photos: PhotoEntry[] = [
  photo('p1', '2026-01-01', [0x52, 0x49, 0x46, 0x46, 0, 1, 2, 3, 255], {
    width: 1080,
    height: 1440,
  }),
  {
    ...photo('p2', '2026-02-01', [9, 8, 7], { angle: 'profil', side: 'hoger', updatedAt: 11 }),
    blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }),
    mimeType: 'image/jpeg',
  },
];

async function seed(): Promise<void> {
  await applySnapshot(
    {
      profile,
      weights,
      waist,
      steps,
      photoSessions,
      photos,
      ...foodData,
      ...trainingData,
      ...glp1Data,
      ...milestoneData,
    },
    'replace',
  );
}

/** Gör om bilderna till byte-arrayer så att snapshots kan jämföras med toEqual. */
async function comparable(snapshot: Snapshot) {
  return {
    ...snapshot,
    photos: await Promise.all(
      snapshot.photos.map(async ({ blob, ...rest }) => ({
        ...rest,
        type: blob.type,
        bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      })),
    ),
  };
}

async function wipe(): Promise<void> {
  await applySnapshot(emptySnapshot(), 'replace');
  expect(await readSnapshot()).toEqual(emptySnapshot());
}

async function errorOf(promise: Promise<unknown>): Promise<BackupError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof BackupError) return err;
    throw err;
  }
  throw new Error('förväntade ett BackupError');
}

function zipOf(files: Record<string, string | Uint8Array>): Blob {
  const entries = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [
      name,
      typeof content === 'string' ? strToU8(content) : content,
    ]),
  );
  return new Blob([zipSync(entries)]);
}

describe('backup round-trip', () => {
  it('export → import ger identisk data (okrypterad)', async () => {
    await seed();
    const before = await comparable(await readSnapshot());

    const file = await createBackup(await readSnapshot(), { now: NOW });
    expect(file.type).toBe('application/zip');
    await wipe();

    const contents = await readBackup(file);
    expect(contents.encrypted).toBe(false);
    expect(contents.exportedAt).toBe(NOW.toISOString());
    await applySnapshot(contents.snapshot, 'replace');

    expect(await comparable(await readSnapshot())).toEqual(before);
  });

  it('export → import ger identisk data (krypterad)', async () => {
    await seed();
    const before = await comparable(await readSnapshot());

    const file = await createBackup(await readSnapshot(), {
      password: 'korrekt häst batteri',
      now: NOW,
      iterations: ITERATIONS,
    });
    await wipe();

    const contents = await readBackup(file, 'korrekt häst batteri');
    expect(contents.encrypted).toBe(true);
    await applySnapshot(contents.snapshot, 'replace');

    expect(await comparable(await readSnapshot())).toEqual(before);
  });

  it('krypterad fil innehåller ingen data i klartext', async () => {
    await seed();
    const file = await createBackup(await readSnapshot(), {
      password: 'hemligt',
      iterations: ITERATIONS,
    });
    const text = new TextDecoder('latin1').decode(await file.arrayBuffer());
    expect(text).not.toContain('Bra vecka');
    // Med citattecken: två slumpbytes i chiffertexten kan råka bli "m2".
    expect(text).not.toContain('"m2"');
    expect(text).not.toContain('Mormors');
    expect(text).not.toContain('photos/');
  });

  it('tom databas går också att exportera och importera', async () => {
    const file = await createBackup(await readSnapshot(), { now: NOW });
    const contents = await readBackup(file);
    expect(contents.snapshot).toEqual(emptySnapshot());
  });
});

describe('backup lösenord', () => {
  it('fel lösenord ger ett tydligt fel', async () => {
    await seed();
    const file = await createBackup(await readSnapshot(), {
      password: 'rätt',
      iterations: ITERATIONS,
    });
    const err = await errorOf(readBackup(file, 'fel'));
    expect(err.code).toBe('wrong-password');
    expect(err.message).toMatch(/Fel lösenord/);
  });

  it('krypterad fil utan lösenord kräver lösenord', async () => {
    const file = await createBackup(await readSnapshot(), {
      password: 'rätt',
      iterations: ITERATIONS,
    });
    expect((await errorOf(readBackup(file))).code).toBe('password-required');
    expect((await errorOf(readBackup(file, ''))).code).toBe('password-required');
  });
});

describe('backup validering', () => {
  const header = { format: BACKUP_FORMAT, version: BACKUP_VERSION };
  const valid = {
    ...header,
    exportedAt: NOW.toISOString(),
    profile: null,
    weights: [{ id: 'a', date: '2026-01-01', weightKg: 80, createdAt: 1 }],
    waist: [{ date: '2026-01-01', waistCm: 90, createdAt: 1 }],
    steps: [{ date: '2026-01-01', steps: 8000, createdAt: 1 }],
    photoSessions: [],
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
    milestones: [],
    foodUnits: [],
  };

  it('avvisar filer som inte är zip', async () => {
    const err = await errorOf(readBackup(new Blob(['inte en zip'])));
    expect(err.code).toBe('not-a-backup');
  });

  it('avvisar zip utan backup.json eller med fel format', async () => {
    expect((await errorOf(readBackup(zipOf({ 'annat.txt': 'hej' })))).code).toBe('not-a-backup');
    const other = zipOf({ 'backup.json': JSON.stringify({ ...valid, format: 'annat' }) });
    expect((await errorOf(readBackup(other))).code).toBe('not-a-backup');
  });

  it('avvisar nyare versioner', async () => {
    const file = zipOf({ 'backup.json': JSON.stringify({ ...valid, version: 99 }) });
    expect((await errorOf(readBackup(file))).code).toBe('unsupported-version');
  });

  it('avvisar ogiltiga poster', async () => {
    const cases: unknown[] = [
      { ...valid, weights: [{ id: 'a', date: '2026-13-01', weightKg: 80, createdAt: 1 }] },
      { ...valid, weights: [{ id: 'a', date: '2026-01-01', weightKg: '80', createdAt: 1 }] },
      { ...valid, weights: [{ id: 'a', date: '2026-01-01', weightKg: 80 }] },
      { ...valid, weights: [valid.weights[0], valid.weights[0]] },
      { ...valid, steps: [{ date: '2026-01-01', steps: 1.5, createdAt: 1 }] },
      { ...valid, steps: [{ date: '2026-01-01', steps: -1, createdAt: 1 }] },
      { ...valid, steps: [valid.steps[0], valid.steps[0]] },
      { ...valid, waist: [{ date: '2026-01-01', waistCm: 0, createdAt: 1 }] },
      { ...valid, waist: [{ date: '2026-01-01', waistCm: 90 }] },
      { ...valid, waist: [valid.waist[0], valid.waist[0]] },
      { ...valid, profile: { startDate: '2026-01-01' } },
      { ...valid, weights: 'nej' },
      { ...valid, steps: undefined },
      // Version 6 kräver egna enheter, med rimliga värden.
      { ...valid, foodUnits: undefined },
      { ...valid, foodUnits: [{ foodId: 'lv:1', units: [st('st', 0)], createdAt: 1 }] },
      {
        ...valid,
        foodUnits: [{ foodId: 'lv:1', units: [{ ...st('st', 60), source: 'x' }], createdAt: 1 }],
      },
      { ...valid, foodUnits: [{ foodId: 'lv:1', units: [st('', 60)], createdAt: 1 }] },
      { ...valid, foodUnits: [foodUnits[0], foodUnits[0]] },
      { ...valid, foodLog: [{ ...foodLog[1], amount: undefined }] },
      { ...valid, foodLog: [{ ...foodLog[1], amount: -1 }] },
      { ...valid, foodLog: [{ ...foodLog[1], grams: undefined }] },
      // Version 7 kräver milstolpar, med giltiga id:n och datum.
      { ...valid, milestones: undefined },
      { ...valid, milestones: [{ id: 'kg-1', date: 'igår', createdAt: 1 }] },
      { ...valid, milestones: [{ id: '<script>', date: '2026-01-01', createdAt: 1 }] },
      { ...valid, milestones: [milestones[0], milestones[0]] },
      // Version 1 kräver `measurements`.
      { ...valid, version: 1 },
      {
        ...valid,
        version: 1,
        measurements: [{ id: 'a', date: '2026-01-01', weightKg: 80, createdAt: 1, steps: 1.5 }],
      },
      { ...valid, exportedAt: 'igår' },
      // Version 3 kräver matdata.
      { ...valid, foods: undefined },
      { ...valid, foodLog: [{ ...foodLog[0], meal: 'brunch' }] },
      { ...valid, foodLog: [{ ...foodLog[0], grams: 0 }] },
      { ...valid, foodLog: [{ ...foodLog[0], per100: { kcal: 10 } }] },
      { ...valid, foodLog: [foodLog[0], foodLog[0]] },
      { ...valid, foods: [{ ...foods[0], source: 'livsmedelsverket' }] },
      { ...valid, foods: [{ ...foods[0], ean: '<script>' }] },
      { ...valid, meals: [{ ...meals[0], items: [{ foodId: 'x', name: 'x', grams: -1 }] }] },
      { ...valid, favorites: [{ foodId: 'x' }] },
      { ...valid, profile: { ...profile, sex: 'annat' } },
      { ...valid, profile: { ...profile, ratePerWeekKg: 2 } },
      { ...valid, profile: { ...profile, activityLevel: 'extrem' } },
      {
        ...valid,
        photos: [
          { id: 'p', date: '2026-01-01', mimeType: 'image/webp', createdAt: 1, file: 'photos/p' },
        ],
      },
      {
        ...valid,
        photos: [{ id: 'p', date: '2026-01-01', mimeType: 'text/html', createdAt: 1, file: 'x' }],
      },
      // Version 8 kräver fototillfällen, och varje bild ska höra till ett.
      { ...valid, photoSessions: undefined },
      { ...valid, photoSessions: [{ id: 's', date: 'nej', createdAt: 1 }] },
      { ...valid, photoSessions: [{ id: 's', date: '2026-01-01', createdAt: 1, weightKg: -1 }] },
      {
        ...valid,
        photoSessions: [
          { id: 's', date: '2026-01-01', createdAt: 1 },
          { id: 's', date: '2026-01-02', createdAt: 1 },
        ],
      },
    ];
    for (const manifest of cases) {
      const err = await errorOf(readBackup(zipOf({ 'backup.json': JSON.stringify(manifest) })));
      expect(err.code, JSON.stringify(manifest)).toBe('invalid-data');
    }
  });

  it('behåller mängd, enhet och gram för loggposter och ingredienser', async () => {
    const eggs = { ...(foodLog[1] as FoodLogEntry), id: 'egg', amount: 2, unit: 'st', grams: 120 };
    const meal: SavedMeal = {
      ...(meals[0] as SavedMeal),
      items: [{ ...(meals[0]?.items[1] as SavedMeal['items'][number]), amount: 2, unit: 'dl' }],
    };
    const contents = await readBackup(
      await createBackup(
        { ...emptySnapshot(), foodLog: [eggs], meals: [meal], foodUnits },
        { now: NOW },
      ),
    );
    expect(contents.snapshot.foodLog).toEqual([eggs]);
    expect(contents.snapshot.meals).toEqual([meal]);
    expect(contents.snapshot.foodUnits).toEqual(foodUnits);
  });

  it('tar bort okända fält', async () => {
    const file = zipOf({
      'backup.json': JSON.stringify({
        ...valid,
        weights: [{ ...valid.weights[0], evil: '<script>' }],
        steps: [{ ...valid.steps[0], evil: '<script>' }],
        foodLog: [{ ...foodLog[1], evil: '<script>', per100: { ...foodLog[1]?.per100, x: 1 } }],
        workouts: [{ ...workouts[0], evil: '<script>' }],
        workoutPlans: [{ ...workoutPlans[0], evil: '<script>' }],
        medications: [
          {
            ...medications[0],
            evil: '<script>',
            steps: medications[0]?.steps.map((st) => ({ ...st, x: 1 })),
          },
        ],
        injections: [{ ...injections[0], evil: '<script>' }],
        symptoms: [{ ...symptoms[0], evil: '<script>' }],
        milestones: [{ ...milestones[0], evil: '<script>' }],
      }),
    });
    const contents = await readBackup(file);
    expect(contents.snapshot.milestones).toEqual([milestones[0]]);
    expect(contents.snapshot.medications).toEqual([medications[0]]);
    expect(contents.snapshot.injections).toEqual([injections[0]]);
    expect(contents.snapshot.symptoms).toEqual([symptoms[0]]);
    expect(contents.snapshot.workouts).toEqual([workouts[0]]);
    expect(contents.snapshot.workoutPlans).toEqual(workoutPlans);
    expect(contents.snapshot.weights).toEqual(valid.weights);
    expect(contents.snapshot.steps).toEqual(valid.steps);
    expect(contents.snapshot.foodLog).toEqual([foodLog[1]]);
  });

  it('avvisar manipulerade krypteringsparametrar', async () => {
    const file = zipOf({
      'backup.json': JSON.stringify({
        ...header,
        encryption: {
          kdf: 'PBKDF2',
          hash: 'SHA-256',
          iterations: 1,
          salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
          cipher: 'AES-GCM',
          iv: 'AAAAAAAAAAAAAAAA',
        },
      }),
      'backup.enc': new Uint8Array(32),
    });
    expect((await errorOf(readBackup(file, 'x'))).code).toBe('invalid-data');
  });
});

describe('import av version 1 (kombinerade mätningar)', () => {
  const v1 = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: NOW.toISOString(),
    profile,
    measurements: [
      { id: 'm1', date: '2026-01-01', weightKg: 92.5, createdAt: 1 },
      {
        id: 'm2',
        date: '2026-01-08',
        weightKg: 91.2,
        waistCm: 101,
        steps: 4000,
        note: 'Bra vecka',
        createdAt: 2,
        updatedAt: 5,
      },
      { id: 'm3', date: '2026-01-08', weightKg: 91.0, steps: 9000, createdAt: 3 },
    ],
    photos: [
      {
        id: 'p1',
        date: '2026-01-01',
        mimeType: 'image/webp',
        createdAt: 10,
        file: 'photos/p1.webp',
      },
    ],
  };

  const expected: Omit<Snapshot, 'photos'> = {
    photoSessions: [{ id: 'migrerad:2026-01-01', date: '2026-01-01', createdAt: 10 }],
    milestones: [],
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
    profile,
    weights: [
      { id: 'm1', date: '2026-01-01', weightKg: 92.5, createdAt: 1 },
      {
        id: 'm2',
        date: '2026-01-08',
        weightKg: 91.2,
        note: 'Bra vecka',
        createdAt: 2,
        updatedAt: 5,
      },
      { id: 'm3', date: '2026-01-08', weightKg: 91.0, createdAt: 3 },
    ],
    waist: [{ date: '2026-01-08', waistCm: 101, createdAt: 2, updatedAt: 5 }],
    steps: [{ date: '2026-01-08', steps: 9000, createdAt: 3 }],
  };

  function v1Zip(): Uint8Array<ArrayBuffer> {
    return new Uint8Array(
      zipSync({
        'backup.json': strToU8(JSON.stringify(v1)),
        'photos/p1.webp': new Uint8Array([1, 2, 3]),
      }),
    );
  }

  it('okrypterad: delar upp mätningarna och går att återställa', async () => {
    const contents = await readBackup(new Blob([v1Zip()]));
    const { photos: importedPhotos, ...rest } = contents.snapshot;
    expect(rest).toEqual(expected);
    expect(importedPhotos.map((p) => p.id)).toEqual(['p1']);
    expect(summarizeBackup(contents)).toMatchObject({ weights: 3, waist: 1, steps: 1, photos: 1 });

    await applySnapshot(contents.snapshot, 'replace');
    expect({ ...(await readSnapshot()), photos: [] }).toEqual({ ...expected, photos: [] });
  });

  it('krypterad: dekrypteras med version 1 som AAD', async () => {
    const password = 'gammalt lösenord';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const base = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`${BACKUP_FORMAT}:1`) },
      key,
      v1Zip(),
    );
    const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    const file = zipOf({
      'backup.json': JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        encryption: {
          kdf: 'PBKDF2',
          hash: 'SHA-256',
          iterations: ITERATIONS,
          salt: b64(salt),
          cipher: 'AES-GCM',
          iv: b64(iv),
        },
      }),
      'backup.enc': new Uint8Array(ciphertext),
    });

    const contents = await readBackup(file, password);
    expect(contents.encrypted).toBe(true);
    expect({ ...contents.snapshot, photos: [] }).toEqual({ ...expected, photos: [] });
  });
});

describe('import av version 7 (bilder utan tillfällen)', () => {
  it('grupperar bilderna per datum med vinkel "ej angiven" och vikten på tillfället', async () => {
    const v7 = {
      format: BACKUP_FORMAT,
      version: 7,
      exportedAt: NOW.toISOString(),
      profile: null,
      weights: [],
      waist: [],
      steps: [],
      photos: [
        {
          id: 'a',
          date: '2026-01-01',
          mimeType: 'image/webp',
          createdAt: 1,
          weightKg: 90,
          file: 'photos/a.webp',
        },
        {
          id: 'b',
          date: '2026-01-01',
          mimeType: 'image/webp',
          createdAt: 2,
          file: 'photos/b.webp',
        },
        {
          id: 'c',
          date: '2026-02-01',
          mimeType: 'image/webp',
          createdAt: 3,
          weightKg: 88,
          width: 3,
          height: 4,
          file: 'photos/c.webp',
        },
      ],
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
    const file = zipOf({
      'backup.json': JSON.stringify(v7),
      'photos/a.webp': new Uint8Array([1]),
      'photos/b.webp': new Uint8Array([2]),
      'photos/c.webp': new Uint8Array([3]),
    });
    const { snapshot } = await readBackup(file);
    expect(snapshot.photoSessions).toEqual([
      { id: 'migrerad:2026-01-01', date: '2026-01-01', weightKg: 90, createdAt: 1 },
      { id: 'migrerad:2026-02-01', date: '2026-02-01', weightKg: 88, createdAt: 3 },
    ]);
    expect(snapshot.photos.map((p) => [p.id, p.sessionId, p.angle])).toEqual([
      ['a', 'migrerad:2026-01-01', 'okand'],
      ['b', 'migrerad:2026-01-01', 'okand'],
      ['c', 'migrerad:2026-02-01', 'okand'],
    ]);
    expect(snapshot.photos.some((p) => 'weightKg' in p)).toBe(false);

    // Sammanslagning två gånger dubblerar inte tillfällena.
    await applySnapshot(snapshot, 'merge');
    await applySnapshot(snapshot, 'merge');
    expect((await readSnapshot()).photoSessions).toHaveLength(2);
  });

  it('en bild som pekar på ett okänt tillfälle avvisas i version 8', async () => {
    const file = zipOf({
      'backup.json': JSON.stringify({
        format: BACKUP_FORMAT,
        version: 8,
        exportedAt: NOW.toISOString(),
        profile: null,
        weights: [],
        waist: [],
        steps: [],
        photoSessions: [{ id: 's1', date: '2026-01-01', createdAt: 1 }],
        photos: [
          {
            id: 'a',
            sessionId: 'okänt',
            angle: 'fram',
            date: '2026-01-01',
            mimeType: 'image/webp',
            createdAt: 1,
            file: 'photos/a.webp',
          },
        ],
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
      }),
      'photos/a.webp': new Uint8Array([1]),
    });
    expect((await errorOf(readBackup(file))).message).toMatch(/okänt fototillfälle/);
  });
});

describe('import av version 2 (utan mat)', () => {
  it('läser in vikt, midja och steg och ger tom matdata', async () => {
    const v2 = {
      format: BACKUP_FORMAT,
      version: 2,
      exportedAt: NOW.toISOString(),
      profile: {
        startDate: '2026-01-01',
        startWeightKg: 92.5,
        heightCm: 181,
        goalWeightKg: 80,
      },
      weights,
      waist,
      steps,
      photos: [],
    };
    const contents = await readBackup(zipOf({ 'backup.json': JSON.stringify(v2) }));
    expect(contents.snapshot).toEqual({
      ...emptySnapshot(),
      profile: v2.profile,
      weights,
      waist,
      steps,
    });
    await applySnapshot(contents.snapshot, 'replace');
    expect((await readSnapshot()).weights).toEqual(weights);
  });
});

describe('import av version 3 (utan vatten och träning)', () => {
  it('läser in maten och ger tomma listor för vatten och träning', async () => {
    const v3 = {
      format: BACKUP_FORMAT,
      version: 3,
      exportedAt: NOW.toISOString(),
      profile,
      weights,
      waist,
      steps,
      photos: [],
      ...legacyFoodData,
    };
    const contents = await readBackup(zipOf({ 'backup.json': JSON.stringify(v3) }));
    expect(contents.snapshot).toEqual({
      ...emptySnapshot(),
      profile,
      weights,
      waist,
      steps,
      ...foodData,
    });
  });
});

describe('import av version 4 (utan GLP-1)', () => {
  it('läser in vatten och träning och ger tomma GLP-1-listor', async () => {
    const v4 = {
      format: BACKUP_FORMAT,
      version: 4,
      exportedAt: NOW.toISOString(),
      profile,
      weights,
      waist,
      steps,
      photos: [],
      ...legacyFoodData,
      ...trainingData,
    };
    const contents = await readBackup(zipOf({ 'backup.json': JSON.stringify(v4) }));
    expect(contents.snapshot).toEqual({
      ...emptySnapshot(),
      profile,
      weights,
      waist,
      steps,
      ...foodData,
      ...trainingData,
    });
    await applySnapshot(contents.snapshot, 'replace');
    expect((await readSnapshot()).medications).toEqual([]);
  });
});

describe('import av version 6 (utan milstolpar)', () => {
  it('läser in allt och ger en tom lista med milstolpar', async () => {
    const v6 = {
      format: BACKUP_FORMAT,
      version: 6,
      exportedAt: NOW.toISOString(),
      profile,
      weights,
      waist,
      steps,
      photos: [],
      ...foodData,
      ...trainingData,
      ...glp1Data,
    };
    const contents = await readBackup(zipOf({ 'backup.json': JSON.stringify(v6) }));
    expect(contents.snapshot).toEqual({
      ...emptySnapshot(),
      profile,
      weights,
      waist,
      steps,
      ...foodData,
      ...trainingData,
      ...glp1Data,
    });
    expect(contents.snapshot.milestones).toEqual([]);
  });
});

describe('validering av GLP-1', () => {
  async function manifestWith(patch: Record<string, unknown>) {
    const base = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: NOW.toISOString(),
      profile: null,
      weights: [],
      waist: [],
      steps: [],
      photos: [],
      photoSessions: [],
      foods: [],
      meals: [],
      foodLog: [],
      favorites: [],
      foodUnits: [],
      milestones: [],
      ...trainingData,
      ...glp1Data,
      ...patch,
    };
    return errorOf(readBackup(zipOf({ 'backup.json': JSON.stringify(base) })));
  }

  it('avvisar ogiltiga poster', async () => {
    const med = medications[0] as Medication;
    const cases: Record<string, unknown>[] = [
      { medications: [{ ...med, steps: [] }] },
      { medications: [{ ...med, steps: [{ date: '2026-01-05', doseMg: 0 }] }] },
      {
        medications: [
          {
            ...med,
            steps: [
              { date: '2026-01-05', doseMg: 1 },
              { date: '2026-01-05', doseMg: 2 },
            ],
          },
        ],
      },
      { medications: [{ ...med, frequency: 'manad' }] },
      { medications: [{ ...med, weekday: 7 }] },
      { medications: [{ ...med, endDate: '2025-12-31' }] },
      { injections: [{ ...injections[0], site: 'nacke' }] },
      { injections: [{ ...injections[0], doseMg: -1 }] },
      { injections: [injections[0], injections[0]] },
      { symptoms: [{ date: '2026-01-06', appetite: 6, sideEffects: [], createdAt: 1 }] },
      { symptoms: [{ date: '2026-01-06', sideEffects: [''], createdAt: 1 }] },
    ];
    for (const patch of cases) {
      expect((await manifestWith(patch)).code, JSON.stringify(patch)).toBe('invalid-data');
    }
    expect((await manifestWith({ injections: undefined })).message).toMatch(/GLP-1/);
  });
});

describe('validering av vatten och träning', () => {
  async function manifestWith(patch: Record<string, unknown>) {
    const base = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: NOW.toISOString(),
      profile: null,
      weights: [],
      waist: [],
      steps: [],
      photos: [],
      photoSessions: [],
      foods: [],
      meals: [],
      foodLog: [],
      favorites: [],
      foodUnits: [],
      milestones: [],
      ...trainingData,
      ...glp1Data,
      ...patch,
    };
    return errorOf(readBackup(zipOf({ 'backup.json': JSON.stringify(base) })));
  }

  it('avvisar ogiltiga poster', async () => {
    const cases: Record<string, unknown>[] = [
      { water: [{ id: 'x', date: '2026-01-01', ml: -5, createdAt: 1 }] },
      { workouts: [{ ...workouts[1], status: 'kanske' }] },
      { workouts: [{ ...workouts[0], time: '25:00' }] },
      { workoutPlans: [{ ...workoutPlans[0], weekdays: [] }] },
      { workoutPlans: [{ ...workoutPlans[0], weekdays: [1, 1] }] },
      { workouts: [workouts[0], workouts[0]] },
      { profile: { ...profile, waterGoalMl: 99_999 } },
      { profile: { ...profile, proteinFactor: 2.5 } },
      { profile: { ...profile, proteinFactor: '1.6' } },
    ];
    for (const patch of cases) {
      expect((await manifestWith(patch)).code, JSON.stringify(patch)).toBe('invalid-data');
    }
    expect((await manifestWith({ water: undefined })).message).toMatch(/Vatten/);
  });

  it('behåller eget vattenmål i profilen', async () => {
    const withGoal = { ...profile, waterGoalMl: 2500 };
    const contents = await readBackup(
      await createBackup({ ...emptySnapshot(), profile: withGoal }, { now: NOW }),
    );
    expect(contents.snapshot.profile).toEqual(withGoal);
  });

  it('behåller proteinfaktorn i profilen', async () => {
    const withFactor = { ...profile, proteinFactor: 1.8 };
    const contents = await readBackup(
      await createBackup({ ...emptySnapshot(), profile: withFactor }, { now: NOW }),
    );
    expect(contents.snapshot.profile).toEqual(withFactor);
  });
});

describe('import slå ihop', () => {
  it('lägger till nya poster, senast ändrade vinner och befintlig profil behålls', async () => {
    await seed();
    const local = { ...profile, goalWeightKg: 78 };
    await saveProfile(local);

    const imported: Snapshot = {
      profile,
      weights: [
        // Äldre version av m2 → ignoreras.
        { id: 'm2', date: '2026-01-08', weightKg: 99, createdAt: 2, updatedAt: 3 },
        // Nyare version av m3 → ersätter.
        { id: 'm3', date: '2026-01-08', weightKg: 90.5, createdAt: 3, updatedAt: 7 },
        { id: 'm4', date: '2026-01-15', weightKg: 90.1, createdAt: 8 },
      ],
      waist: [
        // Äldre ändring samma dag → ignoreras.
        { date: '2026-01-08', waistCm: 120, createdAt: 2, updatedAt: 4 },
        { date: '2026-01-15', waistCm: 100, createdAt: 8 },
      ],
      steps: [
        // Nyare värde samma dag → ersätter.
        { date: '2026-01-08', steps: 5000, createdAt: 3, updatedAt: 9 },
        // Lika gammalt → befintligt behålls.
        { date: '2026-01-07', steps: 1, createdAt: 2 },
      ],
      photoSessions: [
        // Vikten ändrad senare på den andra enheten → ersätter; nytt tillfälle läggs till.
        { ...(photoSessions[0] as PhotoSession), weightKg: 92, updatedAt: 60 },
        { id: 's-2026-03-01', date: '2026-03-01', createdAt: 10 },
      ],
      photos: [
        photo('p3', '2026-03-01', [1, 2, 3]),
        // Vinkeln ändrad tidigare än lokalt → lokal behålls.
        { ...(photos[1] as PhotoEntry), angle: 'fram', updatedAt: 5 },
      ],
      foods: [
        // Nyare version av den cachade produkten → ersätter.
        { ...(foods[1] as StoredFood), name: 'Havregryn 1 kg', updatedAt: 20 },
      ],
      meals: [{ ...(meals[0] as SavedMeal), name: 'Gammal gröt', updatedAt: 1 }],
      foodLog: [{ ...(foodLog[1] as FoodLogEntry), id: 'f3', date: '2026-01-10' }],
      favorites: [
        { foodId: 'lv:2', createdAt: 99 },
        { foodId: 'lv:3', createdAt: 12 },
      ],
      water: [
        // Äldre version av v2 → ignoreras; ny post läggs till.
        { id: 'v2', date: '2026-01-08', ml: 100, createdAt: 13 },
        { id: 'v3', date: '2026-01-09', ml: 330, createdAt: 20 },
      ],
      workouts: [
        // Status ändrad senare på den andra enheten → ersätter.
        { ...(workouts[1] as Workout), status: 'genomford', updatedAt: 30 },
      ],
      workoutPlans: [{ ...(workoutPlans[0] as WorkoutPlan), id: 'plan2', weekdays: [5] }],
      medications: [
        // Trappan ändrad senare på den andra enheten → ersätter.
        {
          ...(medications[0] as Medication),
          steps: [{ date: '2026-01-05', doseMg: 0.25 }],
          updatedAt: 40,
        },
      ],
      injections: [
        // Äldre version av inj2 → ignoreras; ny dos läggs till.
        { ...(injections[1] as Injection), doseMg: 1, updatedAt: 23 },
        { ...(injections[0] as Injection), id: 'inj3', date: '2026-01-19', createdAt: 41 },
      ],
      symptoms: [
        { date: '2026-01-07', appetite: 4, sideEffects: [], createdAt: 26, updatedAt: 42 },
      ],
      foodUnits: [
        // Enheten ändrad senare på den andra enheten → ersätter; nytt livsmedel läggs till.
        {
          foodId: 'egen:gröt',
          units: [{ name: 'tallrik', grams: 300, source: 'egen' }],
          createdAt: 4,
          updatedAt: 50,
        },
        { foodId: 'lv:2', units: [{ name: 'st', grams: 110, source: 'egen' }], createdAt: 51 },
      ],
      milestones: [
        // Redan nådd → befintligt datum behålls; ny milstolpe läggs till.
        { id: 'kg-1', date: '2026-01-20', createdAt: 70 },
        { id: 'pass-1', date: '2026-01-07', createdAt: 71 },
      ],
    };
    await applySnapshot(imported, 'merge');

    const after = await readSnapshot();
    expect(after.profile).toEqual(local);
    expect(after.weights.map((m) => [m.id, m.weightKg])).toEqual([
      ['m1', 92.5],
      ['m2', 91.2],
      ['m3', 90.5],
      ['m4', 90.1],
    ]);
    expect(after.waist.map((w) => [w.date, w.waistCm])).toEqual([
      ['2026-01-08', 101],
      ['2026-01-15', 100],
    ]);
    expect(after.steps.map((s) => [s.date, s.steps])).toEqual([
      ['2026-01-07', 12034],
      ['2026-01-08', 5000],
    ]);
    expect(after.photos.map((p) => [p.id, p.angle])).toEqual([
      ['p1', 'fram'],
      ['p2', 'profil'],
      ['p3', 'fram'],
    ]);
    expect(after.photoSessions.map((x) => [x.id, x.weightKg])).toEqual([
      ['s-2026-01-01', 92],
      ['s-2026-02-01', undefined],
      ['s-2026-03-01', undefined],
    ]);
    expect(after.foods.map((f) => f.name)).toEqual(['Havregryn 1 kg', 'Mormors gröt']);
    expect(after.meals.map((m) => m.name)).toEqual(['Frukostgröt']);
    expect(after.foodLog.map((e) => e.id)).toEqual(['f1', 'f2', 'f3']);
    expect(after.favorites).toEqual([
      { foodId: 'lv:2', createdAt: 11 },
      { foodId: 'lv:3', createdAt: 12 },
    ]);
    expect(after.water.map((w) => [w.id, w.ml])).toEqual([
      ['v1', 250],
      ['v2', 500],
      ['v3', 330],
    ]);
    expect(after.workouts.map((w) => [w.id, w.status])).toEqual([
      ['plan1:2026-01-07', 'genomford'],
      ['w2', 'genomford'],
    ]);
    expect(after.workoutPlans.map((p) => p.id)).toEqual(['plan1', 'plan2']);
    expect(after.medications.map((m) => [m.id, m.steps.length])).toEqual([
      ['med1', 1],
      ['med2', 1],
    ]);
    expect(after.injections.map((i) => [i.id, i.doseMg])).toEqual([
      ['inj1', 0.25],
      ['inj2', 0.25],
      ['inj3', 0.25],
    ]);
    expect(after.symptoms.map((x) => [x.date, x.appetite])).toEqual([
      ['2026-01-06', 2],
      ['2026-01-07', 4],
    ]);
    expect(after.foodUnits.map((u) => [u.foodId, u.units[0]?.grams])).toEqual([
      ['egen:gröt', 300],
      ['lv:2', 110],
    ]);
    expect(after.milestones.map((m) => [m.id, m.date])).toEqual([
      ['pass-1', '2026-01-07'],
      ['kg-1', '2026-01-08'],
      ['dagar-7', '2026-01-15'],
    ]);
    // Loggposterna har kvar sina gram.
    expect(after.foodLog.find((e) => e.id === 'f1')?.grams).toBe(260);
  });

  it('tar profilen från säkerhetskopian om det inte finns någon', async () => {
    await applySnapshot({ ...emptySnapshot(), profile }, 'merge');
    expect((await readSnapshot()).profile).toEqual(profile);
  });
});

describe('summarizeBackup', () => {
  it('sammanfattar innehållet', async () => {
    const contents = await readBackup(
      await createBackup(
        {
          profile,
          weights,
          waist,
          steps,
          photoSessions,
          photos,
          ...foodData,
          ...trainingData,
          ...glp1Data,
          ...milestoneData,
        },
        { now: NOW },
      ),
    );
    expect(summarizeBackup(contents)).toEqual({
      foodLog: 2,
      foods: 2,
      meals: 1,
      water: 2,
      workouts: 2,
      workoutPlans: 1,
      medications: 2,
      injections: 2,
      symptoms: 2,
      milestones: 2,
      exportedAt: NOW.toISOString(),
      encrypted: false,
      hasProfile: true,
      weights: 3,
      waist: 1,
      steps: 2,
      photos: 2,
      photoBytes: 13,
      photoSessions: 2,
      firstDate: '2026-01-01',
      lastDate: '2026-02-01',
    });
  });

  it('filnamnet innehåller datumet', () => {
    expect(backupFileName(new Date(2026, 8, 5))).toBe('viktresan-backup-2026-09-05.zip');
  });
});
