import { useCallback, useEffect, useState } from 'react';
import { getProfile, listMeasurements, type Measurement, type Profile } from '../db/db.ts';

export interface AppData {
  measurements: Measurement[];
  profile: Profile | null;
}

/**
 * Läser mätningar och profil från IndexedDB. `data` är `null` tills första
 * läsningen är klar. `reload` hämtar på nytt efter en ändring.
 */
export function useAppData(): { data: AppData | null; reload: () => Promise<void> } {
  const [data, setData] = useState<AppData | null>(null);

  const load = useCallback(async (): Promise<AppData> => {
    try {
      const [measurements, profile] = await Promise.all([listMeasurements(), getProfile()]);
      return { measurements, profile };
    } catch {
      return { measurements: [], profile: null };
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
    setData(await load());
  }, [load]);

  return { data, reload };
}
