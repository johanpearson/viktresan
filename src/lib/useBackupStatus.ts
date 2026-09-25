import { useCallback, useEffect, useState } from 'react';
import { SETTING_LAST_EXPORT, getOldestEntryTime, getSetting, setSetting } from '../db/db.ts';
import { isBackupDue } from './backupReminder.ts';

export interface BackupStatus {
  lastExportAt: number | null;
  due: boolean;
}

async function load(): Promise<BackupStatus> {
  try {
    const [last, oldestEntryAt] = await Promise.all([
      getSetting(SETTING_LAST_EXPORT),
      getOldestEntryTime(),
    ]);
    const lastExportAt = typeof last === 'number' ? last : null;
    return { lastExportAt, due: isBackupDue({ lastExportAt, oldestEntryAt, now: Date.now() }) };
  } catch {
    return { lastExportAt: null, due: false };
  }
}

/** Senaste export och om det är dags att påminna. `null` tills första läsningen är klar. */
export function useBackupStatus(): {
  status: BackupStatus | null;
  markExported: () => Promise<void>;
  reload: () => Promise<void>;
} {
  const [status, setStatus] = useState<BackupStatus | null>(null);

  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (active) setStatus(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setStatus(await load());
  }, []);

  const markExported = useCallback(async () => {
    await setSetting(SETTING_LAST_EXPORT, Date.now());
    setStatus(await load());
  }, []);

  return { status, markExported, reload };
}
