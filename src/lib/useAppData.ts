import { useCallback, useEffect, useState } from 'react';
import {
  getProfile,
  listSteps,
  listWaist,
  listWeights,
  type Profile,
  type StepsEntry,
  type WaistEntry,
  type WeightEntry,
} from '../db/db.ts';

export interface AppData {
  weights: WeightEntry[];
  waist: WaistEntry[];
  steps: StepsEntry[];
  profile: Profile | null;
}

const EMPTY: AppData = { weights: [], waist: [], steps: [], profile: null };

/**
 * Läser mätningar och profil från IndexedDB. `data` är `null` tills första
 * läsningen är klar. `reload` hämtar på nytt efter en ändring och returnerar
 * den nya datan.
 */
export function useAppData(): { data: AppData | null; reload: () => Promise<AppData> } {
  const [data, setData] = useState<AppData | null>(null);

  const load = useCallback(async (): Promise<AppData> => {
    try {
      const [weights, waist, steps, profile] = await Promise.all([
        listWeights(),
        listWaist(),
        listSteps(),
        getProfile(),
      ]);
      return { weights, waist, steps, profile };
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
