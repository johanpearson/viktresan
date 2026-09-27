/**
 * Milstolpar mot databasen: läser underlaget, sparar nyss nådda milstolpar (en gång var)
 * och returnerar de som ska firas. Körningarna läggs i kö så att två snabba sparningar
 * aldrig firar samma milstolpe två gånger.
 */
import {
  addMilestones,
  getProfile,
  listFoodLog,
  listMilestones,
  listPhotoDates,
  listSteps,
  listWaist,
  listWater,
  listWeights,
  listWorkouts,
} from '../db/db.ts';
import { todayIso } from './dates.ts';
import {
  diffMilestones,
  evaluateMilestones,
  reachedMilestones,
  type Milestone,
  type MilestoneInput,
  type ReachedMilestone,
  type SyncMode,
} from './milestones.ts';

export async function readMilestoneInput(): Promise<MilestoneInput> {
  const [profile, weights, waist, steps, foodLog, water, workouts, photoDates] = await Promise.all([
    getProfile(),
    listWeights(),
    listWaist(),
    listSteps(),
    listFoodLog(),
    listWater(),
    listWorkouts(),
    listPhotoDates(),
  ]);
  return { profile, weights, waist, steps, foodLog, water, workouts, photoDates };
}

export interface SyncOptions {
  /** `silent` vid start och import (sparar utan firande), `live` efter en sparning. */
  mode: SyncMode;
  today?: string;
  now?: number;
  /** Milstolpar för avstängda funktioner sparas men firas inte. */
  isEnabled?: (milestone: Milestone) => boolean;
}

let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

/**
 * Anropas när en körning sparat nya milstolpar (även `silent` vid start), så att en vy som
 * redan läst listan (Framsteg → Milstolpar) kan läsa om den.
 */
export function onMilestonesSaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Sparar nådda milstolpar och returnerar de som ska firas (viktigast först). */
export function syncMilestones(options: SyncOptions): Promise<ReachedMilestone[]> {
  const run = queue.then(() => runSync(options));
  queue = run.catch(() => undefined);
  return run;
}

async function runSync({
  mode,
  today = todayIso(),
  now = Date.now(),
  isEnabled,
}: SyncOptions): Promise<ReachedMilestone[]> {
  const [input, stored] = await Promise.all([readMilestoneInput(), listMilestones()]);
  const reached = reachedMilestones(evaluateMilestones(input, today));
  const diff = diffMilestones(reached, new Set(stored.map((m) => m.id)), {
    mode,
    today,
    ...(isEnabled ? { isEnabled } : {}),
  });
  await addMilestones(
    diff.added.map((r) => ({ id: r.milestone.id, date: r.date, createdAt: now })),
  );
  if (diff.added.length > 0) for (const listener of listeners) listener();
  return diff.celebrate;
}
