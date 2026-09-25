import { useCallback, useEffect, useState } from 'react';
import {
  getProfile,
  listFoodLog,
  listSteps,
  listWaist,
  listWeights,
  type FoodLogEntry,
  type Profile,
  type StepsEntry,
  type WaistEntry,
  type WeightEntry,
} from '../db/db.ts';

export interface AppData {
  weights: WeightEntry[];
  waist: WaistEntry[];
  steps: StepsEntry[];
  foodLog: FoodLogEntry[];
  profile: Profile | null;
}

const EMPTY: AppData = { weights: [], waist: [], steps: [], foodLog: [], profile: null };

/**
 * Läser mätningar, matlogg och profil från IndexedDB. `data` är `null` tills första
 * läsningen är klar. `reload` hämtar på nytt efter en ändring och returnerar
 * den nya datan.
 */
export function useAppData(): { data: AppData | null; reload: () => Promise<AppData> } {
  const [data, setData] = useState<AppData | null>(null);

  const load = useCallback(async (): Promise<AppData> => {
    try {
      const [weights, waist, steps, foodLog, profile] = await Promise.all([
        listWeights(),
        listWaist(),
        listSteps(),
        listFoodLog(),
        getProfile(),
      ]);
      return { weights, waist, steps, foodLog, profile };
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
