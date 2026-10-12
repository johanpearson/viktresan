import { useEffect, useState, type SyntheticEvent } from 'react';
import { readSnapshot } from '../db/db.ts';
import { BACKUP_FILE_NAME, createBackup } from '../lib/backup.ts';
import {
  BACKUP_MODE_LABEL,
  backupMode,
  browserFileDeps,
  download,
  saveToBackupFile,
  type BackupMode,
} from '../lib/backupFile.ts';
import { daysSince } from '../lib/backupReminder.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import { formatBytes } from '../lib/storage.ts';
import type { BackupStatus } from '../lib/useBackupStatus.ts';
import { ListRow } from './ListRow.tsx';

export const MIN_PASSWORD_LENGTH = 8;

interface ExportBackupProps {
  status: BackupStatus | null;
  onExported: () => Promise<void>;
}

const dateTime = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' });

function lastExportText(status: BackupStatus | null): string {
  if (status == null) return 'Kontrollerar…';
  if (status.lastExportAt == null) return 'Ingen ännu';
  return dateTime.format(status.lastExportAt);
}

function lastExportAgo(status: BackupStatus | null): string | undefined {
  if (status?.lastExportAt == null) return undefined;
  const days = daysSince(status.lastExportAt, Date.now());
  return days === 0 ? 'I dag' : days === 1 ? 'I går' : `${String(days)} dagar sedan`;
}

function modeDescription(mode: BackupMode, fileName: string | null): string {
  if (mode === 'nedladdning') return `Laddas ner som ${BACKUP_FILE_NAME}`;
  return fileName
    ? `Varje backup skriver över ${fileName}`
    : 'Du väljer plats och filnamn första gången';
}

/** Problem som löses genom att välja fil igen (primärknappen byter då text). */
type FileProblem = 'stale' | 'denied';

const PROBLEM_TEXT: Record<FileProblem, string> = {
  stale:
    'Den sparade filen går inte längre att skriva till – den kan ha flyttats eller tagits bort. Välj fil igen.',
  denied: 'Viktresan fick inte skriva till filen. Välj fil igen för att ge behörighet.',
};

export function ExportBackup({ status, onExported }: ExportBackupProps) {
  const [mode] = useState(() => backupMode());
  const { prefs } = usePreferences();
  const [fileName, setFileName] = useState<string | null>(null);
  const [problem, setProblem] = useState<FileProblem | null>(null);
  const [encrypt, setEncrypt] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [showDownloadHint, setShowDownloadHint] = useState(false);

  useEffect(() => {
    if (mode !== 'fil') return;
    let active = true;
    void browserFileDeps
      .load()
      .catch(() => null)
      .then((handle) => {
        if (active) setFileName(handle?.name ?? null);
      });
    return () => {
      active = false;
    };
  }, [mode]);

  function validate(): boolean {
    if (!encrypt) return true;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Lösenordet måste ha minst ${String(MIN_PASSWORD_LENGTH)} tecken.`);
      return false;
    }
    if (password !== repeat) {
      setError('Lösenorden matchar inte.');
      return false;
    }
    return true;
  }

  async function build(): Promise<Blob> {
    return createBackup(await readSnapshot(), {
      now: new Date(),
      ...(encrypt ? { password } : {}),
    });
  }

  async function finish(message: string) {
    await onExported();
    setPassword('');
    setRepeat('');
    setDone(message);
  }

  async function saveFile(choose: boolean) {
    let size = 0;
    const result = await saveToBackupFile(
      browserFileDeps,
      async () => {
        const blob = await build();
        size = blob.size;
        return blob;
      },
      { choose },
    );
    switch (result.kind) {
      case 'saved':
        setProblem(null);
        setFileName(result.name);
        await finish(`Säkerhetskopian är sparad i ${result.name} (${formatBytes(size)}).`);
        return;
      case 'cancelled':
        setDone('Ingen fil valdes – ingen säkerhetskopia sparades.');
        return;
      case 'stale':
        setFileName(null);
        setProblem('stale');
        return;
      case 'denied':
        setProblem('denied');
        return;
      case 'error':
        setError('Det gick inte att spara säkerhetskopian. Försök igen.');
        return;
    }
  }

  async function saveDownload() {
    const file = new File([await build()], BACKUP_FILE_NAME, { type: 'application/zip' });
    download(file);
    await finish(`Säkerhetskopian är nedladdad (${file.name}, ${formatBytes(file.size)}).`);
    if (!prefs.backupDownloadHintSeen) {
      setShowDownloadHint(true);
      void setPreference('backupDownloadHintSeen', true);
    }
  }

  async function run(choose: boolean) {
    setDone(null);
    if (!validate()) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === 'fil') await saveFile(choose);
      else await saveDownload();
    } catch {
      setError('Det gick inte att skapa säkerhetskopian. Försök igen.');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    void run(problem != null);
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <h3 className="subheading">Exportera</h3>
      <ul className="list list-flush">
        <ListRow
          primary="Läge"
          secondary={<span data-testid="backup-mode-note">{modeDescription(mode, fileName)}</span>}
          value={
            <span data-testid="backup-mode" data-mode={mode}>
              {BACKUP_MODE_LABEL[mode]}
            </span>
          }
        />
        <ListRow
          primary="Senaste backup"
          secondary={lastExportAgo(status)}
          value={<span data-testid="last-export">{lastExportText(status)}</span>}
          wrapValue
        />
      </ul>
      <label className="switch-row">
        <span className="switch-label">Kryptera med lösenord</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={encrypt}
          onChange={(e) => {
            setEncrypt(e.target.checked);
            setError(null);
          }}
        />
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
      {problem && (
        <p className="form-error" role="alert" data-testid="backup-file-problem">
          {PROBLEM_TEXT[problem]}
        </p>
      )}
      <button type="submit" className="button" disabled={busy}>
        {busy ? 'Förbereder…' : problem ? 'Välj fil igen' : 'Exportera säkerhetskopia'}
      </button>
      {mode === 'fil' && fileName != null && problem == null && (
        <button
          type="button"
          className="button button-ghost button-small"
          disabled={busy}
          onClick={() => void run(true)}
        >
          Välj en annan fil
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="form-ok" role="status">
        {done}
      </p>
      {showDownloadHint && (
        <p className="muted form-note" data-testid="download-hint">
          Varje backup laddas ner som en ny fil. Äldre kopior (t.ex. "viktresan-backup (1).zip") kan
          du ta bort i Filer-appen.
        </p>
      )}
    </form>
  );
}
