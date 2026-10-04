import { useEffect, useMemo, useState } from 'react';
import type { ExtraNutrients } from '../data/nutrients.ts';
import {
  getProfile,
  listAllFoods,
  listFoodOverrides,
  listAllMeals,
  saveProfile,
  type FoodLogEntry,
  type Profile,
} from '../db/db.ts';
import { useFeatures } from './features.ts';
import {
  dailyFiber,
  fiberGoal,
  fiberGoalVisible,
  fiberRampEnabled,
  fiberReferenceG,
  rampStartG,
  type DayFiber,
  type FiberGoal,
  type FiberRampStart,
  type FiberSource,
} from './fiber.ts';
import { overlayExtras } from './foodNutrition.ts';
import { loadLivsmedel, type Livsmedel } from './livsmedel.ts';

let extraCache: { livsmedel: Livsmedel; map: Map<string, ExtraNutrients | null> } | null = null;

function livsmedelExtras(livsmedel: Livsmedel): Map<string, ExtraNutrients | null> {
  if (extraCache?.livsmedel !== livsmedel) {
    extraCache = {
      livsmedel,
      map: new Map(livsmedel.foods.map((f) => [f.id, f.extra ?? null])),
    };
  }
  return extraCache.map;
}

/**
 * Fiberdata för matloggen: Livsmedelsverkets värden, egna livsmedel och cachade Open
 * Food Facts-produkter med fiber, och sparade måltider (ingredienserna). Läses bara när
 * `enabled`; `null` medan den laddas eller om databasen inte gick att läsa. `version`
 * läser om egna livsmedel (t.ex. när matloggen ändrats).
 */
export function useFiberSource(enabled: boolean, version?: unknown): FiberSource | null {
  const [source, setSource] = useState<FiberSource | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.all([loadLivsmedel(), listAllMeals(), listAllFoods(), listFoodOverrides()])
      .then(([livsmedel, meals, foods, overrides]) => {
        const extras = livsmedelExtras(livsmedel);
        const own = new Map<string, ExtraNutrients | null | undefined>();
        for (const f of foods) if (f.fiberG !== undefined) own.set(f.id, { fiberG: f.fiberG });
        // Egna näringsvärden går före källans (även Livsmedelsverkets och Finelis).
        for (const o of overrides) if (!own.has(o.foodId)) own.set(o.foodId, extras.get(o.foodId));
        overlayExtras(own, overrides);
        if (active) setSource({ meals, lookup: (id) => own.get(id) ?? extras.get(id) });
      })
      .catch(() => {
        // Utan databasen blir fibern okänd – resten fungerar.
      });
    return () => {
      active = false;
    };
  }, [enabled, version]);
  return enabled ? source : null;
}

let savingStart = false;

/** Sparar upptrappningens start i profilen (en gång – läser om profilen först). */
async function saveRampStart(start: FiberRampStart): Promise<void> {
  if (savingStart) return;
  savingStart = true;
  try {
    const profile = await getProfile();
    if (profile && fiberRampEnabled(profile) && !profile.fiberRampStart) {
      await saveProfile({ ...profile, fiberRampStart: start });
    }
  } finally {
    savingStart = false;
  }
}

export interface FiberState {
  /** Dagens mål, `null` när fibermålet inte visas. */
  goal: FiberGoal | null;
  /** Fiber per dag med matlogg; `null` medan fiberdatan laddas (eller målet inte visas). */
  days: DayFiber[] | null;
  source: FiberSource | null;
  /** Målet ett visst datum (veckans mål i upptrappningen), `null` när målet inte visas. */
  goalOn: (date: string) => FiberGoal | null;
}

/**
 * Fibermålet och fiber per dag. Datan läses bara när målet visas (GLP-1 på eller "Visa
 * fibermål"). Första gången målet visas med upptrappning sparas starten i profilen:
 * snittet av de senaste 7 loggade dagarna (eller 15 g).
 */
export function useFiber(
  profile: Profile | null,
  foodLog: readonly FoodLogEntry[],
  today: string,
): FiberState {
  const features = useFeatures();
  const glp1Enabled = features.isEnabled('glp1');
  const visible = features.loaded && fiberGoalVisible(profile, glp1Enabled);
  const source = useFiberSource(visible, foodLog);
  const days = useMemo(() => (source ? dailyFiber(foodLog, source) : null), [source, foodLog]);
  const needsStart =
    visible && profile !== null && fiberRampEnabled(profile) && !profile.fiberRampStart;
  const referenceG = fiberReferenceG(profile?.sex);
  const pendingStart = useMemo<FiberRampStart | undefined>(
    () =>
      needsStart && days ? { date: today, startG: rampStartG(days, today, referenceG) } : undefined,
    [needsStart, days, today, referenceG],
  );

  useEffect(() => {
    if (pendingStart) void saveRampStart(pendingStart);
  }, [pendingStart]);

  const goalOn = (date: string) =>
    visible ? fiberGoal(profile, { glp1Enabled, today: date, pendingStart }) : null;
  return { goal: goalOn(today), days: visible ? days : null, source, goalOn };
}

/** Fiberdelen av veckosummeringens underlag: `null` utan fibermål (eller medan datan laddas). */
export function fiberWeekInput(
  fiber: FiberState,
): { days: DayFiber[]; goalOn: (date: string) => number | null } | null {
  if (!fiber.goal || !fiber.days) return null;
  return { days: fiber.days, goalOn: (date) => fiber.goalOn(date)?.goalG ?? null };
}
