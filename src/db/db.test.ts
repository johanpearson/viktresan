import { afterEach, describe, expect, it } from 'vitest';
import { addWeight, getDb, listWeights, resetDbForTests, DB_NAME } from './db.ts';

afterEach(async () => {
  await resetDbForTests();
  indexedDB.deleteDatabase(DB_NAME);
});

describe('db', () => {
  it('skapar alla object stores', async () => {
    const db = await getDb();
    expect([...db.objectStoreNames].sort()).toEqual(['photos', 'settings', 'weights']);
  });

  it('listar vikter sorterade på datum', async () => {
    await addWeight({ id: 'b', date: '2026-02-01', weightKg: 80.2, createdAt: 2 });
    await addWeight({ id: 'a', date: '2026-01-01', weightKg: 81.5, createdAt: 1 });
    const weights = await listWeights();
    expect(weights.map((w) => w.id)).toEqual(['a', 'b']);
  });
});
