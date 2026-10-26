// @vitest-environment node
// Node-miljö: jsdoms Blob överlever inte structuredClone i fake-indexeddb, Nodes gör det.
import { afterEach, describe, expect, it } from 'vitest';
import {
  DB_NAME,
  deleteFood,
  deleteMeal,
  deleteMealSlot,
  deletePhotoSession,
  deleteRecipe,
  deleteSupplement,
  deleteWorkout,
  deleteWorkoutPlan,
  listFoodLog,
  listMealSlots,
  listPhotos,
  listPhotoSessions,
  listSupplementLog,
  listWeights,
  listWorkouts,
  putFood,
  putFoodLog,
  putMeal,
  putMealSlots,
  putPhoto,
  putPhotoSession,
  putRecipe,
  putSupplement,
  putSupplementIntake,
  putWeight,
  putWorkout,
  putWorkoutPlan,
  resetDbForTests,
  type FoodLogEntry,
  type Recipe,
} from './db.ts';
import { defaultMealSlots } from '../lib/mealSlots.ts';
import { loggedRecipe, withBatch, withoutBatch } from '../lib/recipes.ts';
import { dailyIntake } from '../lib/nutrition.ts';

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

const PER100 = { kcal: 200, proteinG: 10, carbsG: 20, fatG: 5 };

const STEW: Recipe = {
  id: 'gryta',
  name: 'Gryta',
  items: [
    { foodId: 'lv:1', name: 'Bönor', amount: 400, unit: 'g', grams: 400, per100: PER100 },
    { foodId: 'egen:k', name: 'Knäcke', amount: 100, unit: 'g', grams: 100, per100: PER100 },
  ],
  servings: 4,
  createdAt: 1,
};

function entry(id: string, foodId: string, name: string, extra: Partial<FoodLogEntry> = {}) {
  const e: FoodLogEntry = {
    id,
    date: '2026-09-20',
    meal: 'kvall',
    foodId,
    name,
    amount: 125,
    unit: 'g',
    grams: 125,
    per100: PER100,
    createdAt: Date.parse('2026-09-20T21:10:00'),
    ...extra,
  };
  return e;
}

/** Loggen utan måltid (som en flytt mellan måltider ändrar). */
function withoutMeal(log: readonly FoodLogEntry[]) {
  return log.map((e) => {
    const rest: Partial<FoodLogEntry> = { ...e };
    delete rest.meal;
    delete rest.updatedAt;
    return rest;
  });
}

describe('borttagning av det användaren skapat', () => {
  it('påverkar aldrig loggar och historik', async () => {
    await putFood({ id: 'egen:k', name: 'Knäcke', source: 'egen', per100: PER100, createdAt: 1 });
    await putMeal({ id: 'frukost-1', name: 'Gröt', items: STEW.items, createdAt: 1 });
    await putRecipe(withBatch(STEW, 5));
    await putMealSlots(defaultMealSlots(1));
    const log = [
      entry('a', 'egen:k', 'Knäcke'),
      entry('b', 'maltid:frukost-1', 'Gröt'),
      entry('c', 'recept:gryta', 'Gryta', {
        unit: 'portion',
        amount: 1,
        recipe: loggedRecipe(STEW),
      }),
      entry('d', 'snabb:middag:600:30', 'Middag', { estimated: true, grams: 100, amount: 1 }),
    ];
    for (const e of log) await putFoodLog(e);
    await putSupplement({
      id: 'd3',
      name: 'D-vitamin',
      form: 'tablett',
      amountPerDose: 1,
      nutrients: [{ key: 'vitaminD', amount: 25, unit: 'µg' }],
      schedule: 'dagligen',
      dosesPerDay: 1,
      createdAt: 1,
    });
    const intake = {
      id: 'd3:2026-09-20',
      date: '2026-09-20',
      supplementId: 'd3',
      name: 'D-vitamin',
      doses: 1,
      nutrients: [{ key: 'vitaminD' as const, amount: 25, unit: 'µg' as const }],
      createdAt: 2,
    };
    await putSupplementIntake(intake);
    await putWorkoutPlan({
      id: 'plan',
      type: 'Löpning',
      weekdays: [0],
      time: '07:00',
      durationMin: 30,
      startDate: '2026-09-01',
      createdAt: 1,
    });
    const answered = {
      id: 'plan:2026-09-14',
      date: '2026-09-14',
      time: '07:00',
      type: 'Löpning',
      durationMin: 30,
      status: 'genomford' as const,
      planId: 'plan',
      createdAt: 3,
    };
    const single = {
      id: 'pass',
      date: '2026-09-15',
      type: 'Löpning',
      durationMin: 30,
      status: 'genomford' as const,
      createdAt: 3,
    };
    await putWorkout(answered);
    await putWorkout(single);
    const weight = { id: 'w', date: '2026-09-20', weightKg: 85, createdAt: 1 };
    await putWeight(weight);
    await putPhotoSession({ id: 's', date: '2026-09-20', weightKg: 85, createdAt: 1 });
    await putPhoto({
      id: 'p',
      sessionId: 's',
      date: '2026-09-20',
      angle: 'fram',
      blob: new Blob(['bild'], { type: 'image/webp' }),
      mimeType: 'image/webp',
      createdAt: 1,
    });
    const intakeBefore = dailyIntake(await listFoodLog());

    // Matlådor, eget livsmedel, måltid, recept, tillskott, schema, fototillfälle och måltidsnamn.
    await putRecipe(withoutBatch(withBatch(STEW, 5)));
    await deleteFood('egen:k');
    await deleteMeal('frukost-1');
    await deleteRecipe('gryta');
    await deleteSupplement('d3');
    await deleteWorkoutPlan('plan');
    await deletePhotoSession('s');
    const moved = await deleteMealSlot('kvall', 'middag');

    const after = await listFoodLog();
    // Samma poster med samma värden – bara måltiden har flyttats (Kvällsmål → Middag).
    expect(withoutMeal(after)).toEqual(withoutMeal(log));
    expect(after.every((e) => e.meal === 'middag')).toBe(true);
    expect(moved.map((e) => e.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(dailyIntake(after)).toEqual(intakeBefore);
    // Det loggade receptet har kvar sin kopia (ingredienser och vikt).
    expect(after.find((e) => e.id === 'c')?.recipe).toEqual(loggedRecipe(STEW));
    expect(await listSupplementLog()).toEqual([intake]);
    expect((await listWorkouts()).map((w) => w.id).sort()).toEqual(['pass', 'plan:2026-09-14']);
    expect(await listWeights()).toEqual([weight]);
    // Bilderna tas bort med tillfället – vikten i viktloggen ligger kvar.
    expect(await listPhotos()).toEqual([]);
    expect(await listPhotoSessions()).toEqual([]);
    expect((await listMealSlots()).map((s) => s.id)).not.toContain('kvall');
  });

  it('ett borttaget pass tar bara bort passet', async () => {
    const base = {
      date: '2026-09-15',
      type: 'Styrka',
      durationMin: 45,
      status: 'genomford' as const,
      createdAt: 1,
    };
    await putWorkout({ ...base, id: 'a' });
    await putWorkout({ ...base, id: 'b' });
    await deleteWorkout('a');
    expect((await listWorkouts()).map((w) => w.id)).toEqual(['b']);
  });
});
