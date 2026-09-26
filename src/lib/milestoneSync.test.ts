// @vitest-environment node
// Node-miljö: säkerhetskopians Blob ska överleva structuredClone i fake-indexeddb.
import { afterEach, describe, expect, it } from 'vitest';
import {
  addMilestones,
  applySnapshot,
  emptySnapshot,
  listMilestones,
  putWeight,
  putWorkout,
  readSnapshot,
  saveProfile,
  type Snapshot,
  type WeightEntry,
  type Workout,
} from '../db/db.ts';
import { deleteTestDb } from '../test/db.ts';
import { createBackup, readBackup } from './backup.ts';
import { addDays } from './dates.ts';
import { syncMilestones } from './milestoneSync.ts';

const TODAY = '2026-09-26';
const profile = { startDate: '2026-01-01', startWeightKg: 100, heightCm: 180, goalWeightKg: 80 };

afterEach(deleteTestDb);

let n = 0;
function weight(date: string, weightKg: number): WeightEntry {
  n += 1;
  return { id: `w${String(n)}`, date, weightKg, createdAt: n };
}

function workout(date: string): Workout {
  n += 1;
  return {
    id: `p${String(n)}`,
    date,
    type: 'Promenad',
    durationMin: 30,
    status: 'genomford',
    createdAt: n,
  };
}

const ids = (list: readonly { milestone: { id: string } }[]) => list.map((r) => r.milestone.id);

describe('syncMilestones', () => {
  it('firar en milstolpe en gång – och den tas inte tillbaka när trenden vänder', async () => {
    await saveProfile(profile);
    for (let i = 0; i < 5; i++) await putWeight(weight(addDays(TODAY, i - 4), 98.5));
    const first = await syncMilestones({ mode: 'live', today: TODAY, now: 1 });
    expect(ids(first)).toEqual(['kg-1']);
    expect(await syncMilestones({ mode: 'live', today: TODAY })).toEqual([]);

    // Vikten går upp igen: milstolpen ligger kvar och firas inte på nytt senare.
    const tomorrow = addDays(TODAY, 1);
    for (let i = 0; i < 20; i++) await putWeight(weight(tomorrow, 101));
    expect(await syncMilestones({ mode: 'live', today: tomorrow })).toEqual([]);
    expect(await listMilestones()).toEqual([
      { id: 'kg-1', date: addDays(TODAY, -4), createdAt: 1 },
    ]);
  });

  it('en tillfällig dipp i dagsvikten ger ingen milstolpe', async () => {
    await saveProfile(profile);
    await putWeight(weight(addDays(TODAY, -2), 100));
    await putWeight(weight(addDays(TODAY, -1), 100));
    await putWeight(weight(TODAY, 97));
    expect(await syncMilestones({ mode: 'live', today: TODAY })).toEqual([]);
    expect(await listMilestones()).toEqual([]);
  });

  it('silent (appstart) sparar passerade milstolpar utan att fira dem', async () => {
    await saveProfile(profile);
    await putWorkout(workout(TODAY));
    expect(await syncMilestones({ mode: 'silent', today: TODAY })).toEqual([]);
    expect((await listMilestones()).map((m) => m.id)).toEqual(['pass-1']);
    expect(await syncMilestones({ mode: 'live', today: TODAY })).toEqual([]);
  });

  it('två snabba sparningar firar inte samma milstolpe två gånger', async () => {
    await saveProfile(profile);
    await putWorkout(workout(TODAY));
    const [a, b] = await Promise.all([
      syncMilestones({ mode: 'live', today: TODAY }),
      syncMilestones({ mode: 'live', today: TODAY }),
    ]);
    expect([...ids(a), ...ids(b)]).toEqual(['pass-1']);
  });
});

describe('import av historisk data', () => {
  /** Ett halvår av nedgång (100 → ~88 kg) och 12 pass, som slutar för två veckor sedan. */
  function history(): Snapshot {
    const end = addDays(TODAY, -14);
    const weights = Array.from({ length: 180 }, (_, i) =>
      weight(addDays(end, i - 179), 100 - i * 0.07),
    );
    const workouts = Array.from({ length: 12 }, (_, i) => workout(addDays(end, -i * 7)));
    return { ...emptySnapshot(), profile, weights, workouts };
  }

  it('markerar redan passerade milstolpar som nådda utan att fira dem – nästa nya firas', async () => {
    const contents = await readBackup(await createBackup(history()));
    await applySnapshot(contents.snapshot, 'replace');
    // Som i ImportBackup: efter importen synkas milstolparna utan firande.
    expect(await syncMilestones({ mode: 'silent', today: TODAY })).toEqual([]);

    const stored = await listMilestones();
    expect(stored.map((m) => m.id).sort()).toEqual(
      [
        'bmi-overvikt',
        'dagar-100',
        'dagar-30',
        'dagar-7',
        'halvvags-80',
        'kg-1',
        'kg-10',
        'kg-5',
        'pass-1',
        'pass-10',
        'procent-10',
        'procent-5',
      ].sort(),
    );
    // Datumen är när milstolparna faktiskt nåddes, inte importdagen.
    for (const m of stored) expect(m.date < addDays(TODAY, -13)).toBe(true);
    expect(stored.find((m) => m.id === 'pass-1')?.date).toBe(addDays(TODAY, -14 - 77));

    // Nästa milstolpe efter importen firas som vanligt – bara den.
    for (let i = 0; i < 7; i++) await putWeight(weight(addDays(TODAY, i - 6), 84));
    const next = await syncMilestones({ mode: 'live', today: TODAY });
    expect(ids(next)).toEqual(['kg-15']);
  });

  it('milstolpar följer med i säkerhetskopian och sparade datum behålls vid sammanslagning', async () => {
    await addMilestones([{ id: 'kg-1', date: '2026-02-01', createdAt: 5 }]);
    const exported = await readBackup(await createBackup(await readSnapshot()));
    expect(exported.snapshot.milestones).toEqual([
      { id: 'kg-1', date: '2026-02-01', createdAt: 5 },
    ]);

    await applySnapshot(
      {
        ...emptySnapshot(),
        milestones: [
          { id: 'kg-1', date: '2026-03-01', createdAt: 9 },
          { id: 'dagar-7', date: '2026-01-10', createdAt: 9 },
        ],
      },
      'merge',
    );
    expect(await listMilestones()).toEqual([
      { id: 'dagar-7', date: '2026-01-10', createdAt: 9 },
      { id: 'kg-1', date: '2026-02-01', createdAt: 5 },
    ]);
  });
});
