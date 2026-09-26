import { useCallback, useEffect, useState } from 'react';
import {
  getProfile,
  listFoodLog,
  listSteps,
  listWaist,
  listWater,
  listWeights,
  listWorkoutPlans,
  listWorkouts,
  type FoodLogEntry,
  type Profile,
  type StepsEntry,
  type WaistEntry,
  type WaterEntry,
  type WeightEntry,
  type Workout,
  type WorkoutPlan,
} from '../db/db.ts';

export interface AppData {
  weights: WeightEntry[];
  waist: WaistEntry[];
  steps: StepsEntry[];
  foodLog: FoodLogEntry[];
  water: WaterEntry[];
  workouts: Workout[];
  workoutPlans: WorkoutPlan[];
  profile: Profile | null;
}

const EMPTY: AppData = {
  weights: [],
  waist: [],
  steps: [],
  foodLog: [],
  water: [],
  workouts: [],
  workoutPlans: [],
  profile: null,
};

/**
 * Läser mätningar, matlogg, vatten, träning och profil från IndexedDB. `data` är `null` tills första
 * läsningen är klar. `reload` hämtar på nytt efter en ändring och returnerar
 * den nya datan.
 */
export function useAppData(): { data: AppData | null; reload: () => Promise<AppData> } {
  const [data, setData] = useState<AppData | null>(null);

  const load = useCallback(async (): Promise<AppData> => {
    try {
      const [weights, waist, steps, foodLog, water, workouts, workoutPlans, profile] =
        await Promise.all([
          listWeights(),
          listWaist(),
          listSteps(),
          listFoodLog(),
          listWater(),
          listWorkouts(),
          listWorkoutPlans(),
          getProfile(),
        ]);
      return { weights, waist, steps, foodLog, water, workouts, workoutPlans, profile };
    } catch {
      return EMPTY;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (active) setData(result);
    });
    return () => {
      active = false;
    };
  }, [load]);

  const reload = useCallback(async () => {
    const next = await load();
    setData(next);
    return next;
  }, [load]);

  return { data, reload };
}
