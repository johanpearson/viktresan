import { BACKUP_REMINDER_DAYS } from '../lib/backupReminder.ts';
import { useBackupStatus } from '../lib/useBackupStatus.ts';

/** Visas när ingen säkerhetskopia gjorts på en vecka och det finns data att förlora. */
export function BackupReminder() {
  const { status } = useBackupStatus();
  if (!status?.due) return null;
  return (
    <aside className="banner" aria-labelledby="backup-reminder-title" data-testid="backup-reminder">
      <p className="banner-title" id="backup-reminder-title">
        Dags att säkerhetskopiera
      </p>
      <p className="banner-text">
        {status.lastExportAt == null
          ? 'Du har inte exporterat någon säkerhetskopia än.'
          : `Det har gått mer än ${String(BACKUP_REMINDER_DAYS)} dagar sedan din senaste export.`}{' '}
        Din data finns bara på den här enheten.
      </p>
      <a className="button button-small" href="#/installningar">
        Exportera nu
      </a>
    </aside>
  );
}
