import { useState, type ChangeEvent, type SyntheticEvent } from 'react';
import { applySnapshot, type ImportMode } from '../db/db.ts';
import { BackupError, readBackup, summarizeBackup, type BackupContents } from '../lib/backup.ts';
import { formatDate } from '../lib/format.ts';
import { syncMilestones } from '../lib/milestoneSync.ts';
import { formatBytes } from '../lib/storage.ts';
import { ChoiceList, type ChoiceOption } from './ChoiceList.tsx';
import { ListRow } from './ListRow.tsx';

interface ImportBackupProps {
  onImported: () => Promise<void>;
}

type State =
  | { step: 'idle' }
  | { step: 'password'; file: File }
  | { step: 'preview'; contents: BackupContents };

const dateTime = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' });

function errorText(err: unknown): string {
  return err instanceof BackupError ? err.message : 'Det gick inte att läsa filen.';
}

export function ImportBackup({ onImported }: ImportBackupProps) {
  const [state, setState] = useState<State>({ step: 'idle' });
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function reset() {
    setState({ step: 'idle' });
    setPassword('');
    setMode('merge');
    setError(null);
  }

  async function open(file: File, pw?: string) {
    setBusy(true);
    setError(null);
    try {
      const contents = await readBackup(file, pw);
      setPassword('');
      setState({ step: 'preview', contents });
    } catch (err) {
      if (err instanceof BackupError && err.code === 'password-required') {
        setState({ step: 'password', file });
      } else {
        setError(errorText(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    reset();
    setDone(null);
    void open(file);
  }

  function handlePassword(event: SyntheticEvent) {
    event.preventDefault();
    if (state.step !== 'password') return;
    void open(state.file, password);
  }

  async function handleImport() {
    if (state.step !== 'preview') return;
    setBusy(true);
    setError(null);
    try {
      await applySnapshot(state.contents.snapshot, mode);
      // Historisk data: redan passerade milstolpar markeras som nådda utan att firas.
      await syncMilestones({ mode: 'silent' });
      const { weights, waist, steps, photos, foodLog } = state.contents.snapshot;
      const count = weights.length + waist.length + steps.length;
      setDone(
        `Importen är klar: ${String(count)} mätningar, ${String(foodLog.length)} matloggposter och ${String(photos.length)} bilder ${
          mode === 'replace' ? 'ersatte den tidigare datan' : 'slogs ihop med befintlig data'
        }.`,
      );
      reset();
      await onImported();
    } catch {
      setError('Importen misslyckades. Ingen data har ändrats.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <h3 className="subheading">Återställ</h3>
      {state.step !== 'preview' && (
        <label className="button button-secondary file-button" aria-disabled={busy}>
          Välj säkerhetskopia
          <input
            className="file-input"
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={handleFile}
          />
        </label>
      )}

      {state.step === 'password' && (
        <form className="form" onSubmit={handlePassword}>
          <p className="form-note">Säkerhetskopian är krypterad.</p>
          <label className="field">
            <span className="field-label">Lösenord för säkerhetskopian</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          </label>
          <div className="button-row">
            <button type="submit" className="button" disabled={busy || password === ''}>
              {busy ? 'Öppnar…' : 'Öppna'}
            </button>
            <button type="button" className="button button-secondary" onClick={reset}>
              Avbryt
            </button>
          </div>
        </form>
      )}

      {state.step === 'preview' && (
        <Preview
          contents={state.contents}
          mode={mode}
          busy={busy}
          onMode={setMode}
          onImport={() => void handleImport()}
          onCancel={reset}
        />
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="form-ok" role="status">
        {busy && state.step === 'idle' ? 'Läser filen…' : done}
      </p>
    </div>
  );
}

interface PreviewProps {
  contents: BackupContents;
  mode: ImportMode;
  busy: boolean;
  onMode: (mode: ImportMode) => void;
  onImport: () => void;
  onCancel: () => void;
}

const IMPORT_MODES: readonly ChoiceOption<ImportMode>[] = [
  {
    id: 'merge',
    label: 'Slå ihop med befintlig data',
    description:
      'Nya poster läggs till. Finns samma post redan behålls den senast ändrade. Din nuvarande profil behålls.',
  },
  {
    id: 'replace',
    label: 'Ersätt all befintlig data',
    description: 'Profil, mätningar, matlogg och bilder på den här enheten raderas och ersätts.',
  },
];

function Preview({ contents, mode, busy, onMode, onImport, onCancel }: PreviewProps) {
  const summary = summarizeBackup(contents);
  const value = (text: string | number, testId?: string) => (
    <span data-testid={testId}>{text}</span>
  );
  return (
    <section className="preview" aria-labelledby="preview-title" data-testid="import-preview">
      <h4 className="preview-title" id="preview-title">
        Innehåll i säkerhetskopian
      </h4>
      <ul className="list list-flush">
        <ListRow primary="Exporterad" value={dateTime.format(new Date(summary.exportedAt))} />
        <ListRow primary="Krypterad" value={summary.encrypted ? 'Ja' : 'Nej'} />
        <ListRow primary="Profil" value={summary.hasProfile ? 'Ja' : 'Nej'} />
        <ListRow primary="Vikt" value={value(summary.weights, 'preview-weights')} />
        <ListRow primary="Midjemått" value={value(summary.waist, 'preview-waist')} />
        <ListRow primary="Dagar med steg" value={value(summary.steps, 'preview-steps')} />
        <ListRow primary="Matloggposter" value={value(summary.foodLog, 'preview-food-log')} />
        <ListRow
          primary="Egna livsmedel och måltider"
          value={value(`${String(summary.foods)} + ${String(summary.meals)}`, 'preview-foods')}
        />
        <ListRow primary="Recept" value={value(summary.recipes, 'preview-recipes')} />
        <ListRow primary="Dryckesposter" value={value(summary.water, 'preview-water')} />
        <ListRow
          primary="Träningspass och scheman"
          value={value(
            `${String(summary.workouts)} + ${String(summary.workoutPlans)}`,
            'preview-workouts',
          )}
        />
        <ListRow
          primary="GLP-1"
          secondary="Läkemedel, doser och dagar med mående"
          value={value(
            `${String(summary.medications)} + ${String(summary.injections)} + ${String(summary.symptoms)}`,
            'preview-glp1',
          )}
        />
        <ListRow
          primary="Tillskott"
          secondary="Tillskott och dagar med tagna doser"
          value={value(
            `${String(summary.supplements)} + ${String(summary.supplementLog)}`,
            'preview-supplements',
          )}
        />
        <ListRow
          primary="Bilder"
          value={value(
            `${String(summary.photos)} (${formatBytes(summary.photoBytes)})`,
            'preview-photos',
          )}
        />
        {summary.firstDate && summary.lastDate && (
          <ListRow
            primary="Period"
            value={`${formatDate(summary.firstDate)} – ${formatDate(summary.lastDate)}`}
            wrapValue
          />
        )}
      </ul>
      <ChoiceList
        legend="Hur ska datan importeras?"
        name="import-mode"
        options={IMPORT_MODES}
        value={mode}
        onChange={onMode}
        dangerOption="replace"
      />
      <div className="button-row">
        <button
          type="button"
          className={mode === 'replace' ? 'button button-danger' : 'button'}
          disabled={busy}
          onClick={onImport}
        >
          {busy ? 'Importerar…' : mode === 'replace' ? 'Ersätt och importera' : 'Importera'}
        </button>
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </section>
  );
}
