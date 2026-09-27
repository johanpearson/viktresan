import { useState, type SyntheticEvent } from 'react';
import { deleteSymptoms, putSymptoms, upsertSymptoms, type SymptomEntry } from '../db/db.ts';
import { symptomSummary } from '../lib/dayMarkers.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate } from '../lib/format.ts';
import { APPETITE_MAX, APPETITE_MIN, SIDE_EFFECTS } from '../lib/glp1.ts';
import type { AppData } from '../lib/useAppData.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { parseSymptomFields } from '../lib/validation.ts';
import { Card } from './Card.tsx';
import { DateBar } from './DateBar.tsx';
import { ListRow } from './ListRow.tsx';
import { Toast } from './Toast.tsx';
import { SegmentedControl } from './SegmentedControl.tsx';
import { ChipGroup } from './ChipGroup.tsx';

/** Antal dagar som visas under formuläret. */
const RECENT_SYMPTOMS = 5;

const APPETITE_LEVELS = Array.from(
  { length: APPETITE_MAX - APPETITE_MIN + 1 },
  (_, i) => APPETITE_MIN + i,
);

interface Fields {
  appetite: string;
  sideEffects: string[];
  other: string;
}

/** Formulärets värden för en dag: det som sparats, annars tomt. */
function fieldsFor(entry: SymptomEntry | undefined): Fields {
  if (!entry) return { appetite: '', sideEffects: [], other: '' };
  const presets = entry.sideEffects.filter((e) => SIDE_EFFECTS.includes(e));
  const own = entry.sideEffects.filter((e) => !SIDE_EFFECTS.includes(e));
  return {
    appetite: entry.appetite == null ? '' : String(entry.appetite),
    sideEffects: presets,
    other: own.join(', '),
  };
}

interface SymptomFormProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Logga → GLP-1 → Mående: valfri kort logg för aptit (1–5) och biverkningar. */
export function SymptomForm({ data, onChange }: SymptomFormProps) {
  const [date, setDate] = useState(todayIso);
  const [fields, setFields] = useState<Fields>(() =>
    fieldsFor(data.symptoms.find((s) => s.date === todayIso())),
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const toast = useUndoToast();
  const existing = data.symptoms.find((s) => s.date === date);

  function changeDate(next: string) {
    setDate(next);
    setFields(fieldsFor(data.symptoms.find((s) => s.date === next)));
  }

  function toggleEffect(effect: string) {
    setFields((f) => ({
      ...f,
      sideEffects: f.sideEffects.includes(effect)
        ? f.sideEffects.filter((e) => e !== effect)
        : [...f.sideEffects, effect],
    }));
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const parsed = parseSymptomFields({ date, ...fields });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const { date: day, ...values } = parsed.value;
    await upsertSymptoms(day, values);
    await onChange();
    setError(null);
    toast.close();
    setStatus(`${existing ? 'Uppdaterade' : 'Sparade'} måendet för ${formatDate(day)}.`);
  }

  /** Tar bort dagens mående direkt (svep eller "Ta bort") – Ångra lägger tillbaka det. */
  async function remove(entry: SymptomEntry) {
    await deleteSymptoms(entry.date);
    await onChange();
    if (entry.date === date) setFields(fieldsFor(undefined));
    setStatus(null);
    toast.show(`Tog bort måendet ${formatDate(entry.date)}.`, async () => {
      await putSymptoms(entry);
      await onChange();
      if (entry.date === date) setFields(fieldsFor(entry));
    });
  }

  const recent = [...data.symptoms].slice(-RECENT_SYMPTOMS).reverse();

  return (
    <>
      <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <DateBar
          date={date}
          today={todayIso()}
          label="Datum"
          testId="log-date"
          onChange={changeDate}
        />
        <p className="form-note">Valfritt. Fyll i det du vill – aptit, biverkningar eller båda.</p>
        <SegmentedControl
          label="Aptit (1 = ingen, 5 = stor)"
          showLabel
          options={APPETITE_LEVELS.map((level) => ({
            id: String(level),
            label: String(level),
            ariaLabel: `Aptit ${String(level)}`,
          }))}
          value={fields.appetite === '' ? null : fields.appetite}
          onChange={(value) => {
            setFields((f) => ({ ...f, appetite: f.appetite === value ? '' : value }));
          }}
        />
        <ChipGroup
          label="Biverkningar"
          options={SIDE_EFFECTS.map((effect) => ({ id: effect, label: effect }))}
          selected={fields.sideEffects}
          onToggle={toggleEffect}
        />
        <label className="field">
          <span className="field-label">Annat (valfri)</span>
          <input
            className="input"
            autoComplete="off"
            maxLength={100}
            value={fields.other}
            onChange={(e) => {
              setFields((f) => ({ ...f, other: e.target.value }));
            }}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button">
          Spara mående
        </button>
        {existing && (
          <button
            type="button"
            className="button button-ghost button-small button-danger-text"
            onClick={() => void remove(existing)}
          >
            Ta bort dagens mående
          </button>
        )}
        <p className="form-ok" role="status">
          {status}
        </p>
      </form>
      {recent.length > 0 && (
        <Card title="Senaste dagarna">
          <ul className="list">
            {recent.map((s) => (
              <ListRow
                key={s.date}
                testId="symptom"
                primary={formatDate(s.date)}
                secondary={symptomSummary(s)}
                onClick={() => {
                  changeDate(s.date);
                }}
                swipeLeft={{ label: 'Ta bort', onSwipe: () => void remove(s) }}
              />
            ))}
          </ul>
        </Card>
      )}
      {toast.toast && (
        <Toast
          label="Mående"
          testId="log-toast"
          message={toast.toast.message}
          onUndo={toast.onUndo}
          onClose={toast.close}
        />
      )}
    </>
  );
}
