export const BACKUP_REMINDER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackupReminderInput {
  /** När senaste exporten gjordes (ms), eller null om aldrig. */
  lastExportAt: number | null;
  /** När den äldsta posten skapades (ms), eller null om det inte finns någon data. */
  oldestEntryAt: number | null;
  now: number;
}

/**
 * Påminn om det finns data och ingen export gjorts på `BACKUP_REMINDER_DAYS`
 * dagar. Har ingen export gjorts räknas tiden från den äldsta posten, så att
 * en ny användare inte påminns första dagen.
 */
export function isBackupDue({ lastExportAt, oldestEntryAt, now }: BackupReminderInput): boolean {
  if (oldestEntryAt == null) return false;
  const since = lastExportAt ?? oldestEntryAt;
  return now - since >= BACKUP_REMINDER_DAYS * DAY_MS;
}

/** Hela dagar sedan `since`, avrundat nedåt. */
export function daysSince(since: number, now: number): number {
  return Math.max(0, Math.floor((now - since) / DAY_MS));
}
