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
  type PhotoEntry,
  type Profile,
  type Snapshot,
  type StepsEntry,
  type WaistEntry,
  type WeightEntry,
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
};

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
    date,
    blob: new Blob([new Uint8Array(bytes)], { type: 'image/webp' }),
    mimeType: 'image/webp',
    createdAt: 10,
    ...extra,
  } satisfies PhotoEntry;
}

const photos: PhotoEntry[] = [
  photo('p1', '2026-01-01', [0x52, 0x49, 0x46, 0x46, 0, 1, 2, 3, 255], {
    weightKg: 92.5,
    width: 1080,
    height: 1440,
  }),
  {
    ...photo('p2', '2026-02-01', [9, 8, 7]),
    blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }),
    mimeType: 'image/jpeg',
  },
];

async function seed(): Promise<void> {
  await applySnapshot({ profile, weights, waist, steps, photos }, 'replace');
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
    expect(text).not.toContain('m2');
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
    photos: [],
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
      // Version 1 kräver `measurements`.
      { ...valid, version: 1 },
      {
        ...valid,
        version: 1,
        measurements: [{ id: 'a', date: '2026-01-01', weightKg: 80, createdAt: 1, steps: 1.5 }],
      },
      { ...valid, exportedAt: 'igår' },
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
    ];
    for (const manifest of cases) {
      const err = await errorOf(readBackup(zipOf({ 'backup.json': JSON.stringify(manifest) })));
      expect(err.code, JSON.stringify(manifest)).toBe('invalid-data');
    }
  });

  it('tar bort okända fält', async () => {
    const file = zipOf({
      'backup.json': JSON.stringify({
        ...valid,
        weights: [{ ...valid.weights[0], evil: '<script>' }],
        steps: [{ ...valid.steps[0], evil: '<script>' }],
      }),
    });
    const contents = await readBackup(file);
    expect(contents.snapshot.weights).toEqual(valid.weights);
    expect(contents.snapshot.steps).toEqual(valid.steps);
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
      photos: [photo('p3', '2026-03-01', [1, 2, 3])],
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
    expect(after.photos.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('tar profilen från säkerhetskopian om det inte finns någon', async () => {
    await applySnapshot({ ...emptySnapshot(), profile }, 'merge');
    expect((await readSnapshot()).profile).toEqual(profile);
  });
});

describe('summarizeBackup', () => {
  it('sammanfattar innehållet', async () => {
    const contents = await readBackup(
      await createBackup({ profile, weights, waist, steps, photos }, { now: NOW }),
    );
    expect(summarizeBackup(contents)).toEqual({
      exportedAt: NOW.toISOString(),
      encrypted: false,
      hasProfile: true,
      weights: 3,
      waist: 1,
      steps: 2,
      photos: 2,
      photoBytes: 13,
      firstDate: '2026-01-01',
      lastDate: '2026-02-01',
    });
  });

  it('filnamnet innehåller datumet', () => {
    expect(backupFileName(new Date(2026, 8, 5))).toBe('viktresan-backup-2026-09-05.zip');
  });
});
