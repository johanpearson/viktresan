import { useState, type SyntheticEvent } from 'react';
import { readSnapshot } from '../db/db.ts';
import { backupFileName, createBackup } from '../lib/backup.ts';
import { daysSince } from '../lib/backupReminder.ts';
import { formatBytes } from '../lib/storage.ts';
import { shareOrDownload } from '../lib/share.ts';
import type { BackupStatus } from '../lib/useBackupStatus.ts';

export const MIN_PASSWORD_LENGTH = 8;

interface ExportBackupProps {
  status: BackupStatus | null;
  onExported: () => Promise<void>;
}

const dateTime = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' });

function lastExportText(status: BackupStatus | null): string {
  if (status == null) return 'Kontrollerar…';
  if (status.lastExportAt == null) return 'Ingen export gjord ännu.';
  const days = daysSince(status.lastExportAt, Date.now());
  const ago = days === 0 ? 'i dag' : days === 1 ? 'i går' : `${String(days)} dagar sedan`;
  return `${dateTime.format(status.lastExportAt)} (${ago})`;
}

export function ExportBackup({ status, onExported }: ExportBackupProps) {
  const [encrypt, setEncrypt] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setDone(null);
    if (encrypt) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Lösenordet måste ha minst ${String(MIN_PASSWORD_LENGTH)} tecken.`);
        return;
      }
      if (password !== repeat) {
        setError('Lösenorden matchar inte.');
        return;
      }
    }
    setError(null);
    setBusy(true);
    try {
      const now = new Date();
      const blob = await createBackup(await readSnapshot(), {
        now,
        ...(encrypt ? { password } : {}),
      });
      const file = new File([blob], backupFileName(now), { type: 'application/zip' });
      const result = await shareOrDownload(file);
      if (result === 'cancelled') {
        setDone('Delningen avbröts – ingen säkerhetskopia sparades.');
        return;
      }
      await onExported();
      setPassword('');
      setRepeat('');
      setDone(
        `${result === 'shared' ? 'Säkerhetskopian är delad' : 'Säkerhetskopian är nedladdad'} (${file.name}, ${formatBytes(file.size)}).`,
      );
    } catch {
      setError('Det gick inte att skapa säkerhetskopian. Försök igen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <h3 className="subheading">Exportera</h3>
      <dl className="kv kv-compact">
        <dt>Senaste export</dt>
        <dd data-testid="last-export">{lastExportText(status)}</dd>
      </dl>
      <label className="check">
        <input
          type="checkbox"
          checked={encrypt}
          onChange={(e) => {
            setEncrypt(e.target.checked);
            setError(null);
          }}
        />
        <span>Kryptera med lösenord</span>
      </label>
      {encrypt && (
        <>
          <label className="field">
            <span className="field-label">Lösenord</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Upprepa lösenordet</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => {
                setRepeat(e.target.value);
              }}
            />
          </label>
          <p className="muted form-note">
            Lösenordet går inte att återställa. Glömmer du det går säkerhetskopian inte att öppna.
          </p>
        </>
      )}
      <button type="submit" className="button" disabled={busy}>
        {busy ? 'Förbereder…' : 'Exportera säkerhetskopia'}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="form-ok" role="status">
        {done}
      </p>
    </form>
  );
}
