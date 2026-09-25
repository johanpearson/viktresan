// @vitest-environment node
// Node-miljö: jsdoms Blob överlever inte structuredClone i fake-indexeddb, Nodes gör det.
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DB_NAME,
  applySnapshot,
  putMeasurement,
  putPhoto,
  readSnapshot,
  resetDbForTests,
  saveProfile,
  type Measurement,
  type PhotoEntry,
  type Profile,
  type Snapshot,
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

const measurements: Measurement[] = [
  { id: 'm1', date: '2026-01-01', weightKg: 92.5, createdAt: 1 },
  {
    id: 'm2',
    date: '2026-01-08',
    weightKg: 91.2,
    waistCm: 101,
    steps: 12034,
    note: 'Bra vecka – "å, ä, ö"',
    createdAt: 2,
    updatedAt: 5,
  },
  { id: 'm3', date: '2026-01-08', weightKg: 91.0, steps: 0, createdAt: 3 },
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
  await saveProfile(profile);
  for (const m of measurements) await putMeasurement(m);
  for (const p of photos) await putPhoto(p);
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
  await applySnapshot({ profile: null, measurements: [], photos: [] }, 'replace');
  expect(await readSnapshot()).toEqual({ profile: null, measurements: [], photos: [] });
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
    expect(contents.snapshot).toEqual({ profile: null, measurements: [], photos: [] });
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
    measurements: [{ id: 'a', date: '2026-01-01', weightKg: 80, createdAt: 1 }],
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
      { ...valid, measurements: [{ id: 'a', date: '2026-13-01', weightKg: 80, createdAt: 1 }] },
      { ...valid, measurements: [{ id: 'a', date: '2026-01-01', weightKg: '80', createdAt: 1 }] },
      { ...valid, measurements: [{ id: 'a', date: '2026-01-01', weightKg: 80 }] },
      {
        ...valid,
        measurements: [{ id: 'a', date: '2026-01-01', weightKg: 80, createdAt: 1, steps: 1.5 }],
      },
      { ...valid, measurements: [valid.measurements[0], valid.measurements[0]] },
      { ...valid, profile: { startDate: '2026-01-01' } },
      { ...valid, measurements: 'nej' },
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
        measurements: [{ ...valid.measurements[0], evil: '<script>' }],
      }),
    });
    const contents = await readBackup(file);
    expect(contents.snapshot.measurements).toEqual(valid.measurements);
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

describe('import slå ihop', () => {
  it('lägger till nya poster, senast ändrade vinner och befintlig profil behålls', async () => {
    await seed();
    const local = { ...profile, goalWeightKg: 78 };
    await saveProfile(local);

    const imported: Snapshot = {
      profile,
      measurements: [
        // Äldre version av m2 → ignoreras.
        { id: 'm2', date: '2026-01-08', weightKg: 99, createdAt: 2, updatedAt: 3 },
        // Nyare version av m3 → ersätter.
        { id: 'm3', date: '2026-01-08', weightKg: 90.5, createdAt: 3, updatedAt: 7 },
        { id: 'm4', date: '2026-01-15', weightKg: 90.1, createdAt: 8 },
      ],
      photos: [photo('p3', '2026-03-01', [1, 2, 3])],
    };
    await applySnapshot(imported, 'merge');

    const after = await readSnapshot();
    expect(after.profile).toEqual(local);
    expect(after.measurements.map((m) => [m.id, m.weightKg])).toEqual([
      ['m1', 92.5],
      ['m2', 91.2],
      ['m3', 90.5],
      ['m4', 90.1],
    ]);
    expect(after.photos.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('tar profilen från säkerhetskopian om det inte finns någon', async () => {
    await applySnapshot({ profile, measurements: [], photos: [] }, 'merge');
    expect((await readSnapshot()).profile).toEqual(profile);
  });
});

describe('summarizeBackup', () => {
  it('sammanfattar innehållet', async () => {
    const contents = await readBackup(
      await createBackup({ profile, measurements, photos }, { now: NOW }),
    );
    expect(summarizeBackup(contents)).toEqual({
      exportedAt: NOW.toISOString(),
      encrypted: false,
      hasProfile: true,
      measurements: 3,
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
