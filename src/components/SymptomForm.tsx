import { useState, type SyntheticEvent } from 'react';
import { deleteSymptoms, upsertSymptoms, type SymptomEntry } from '../db/db.ts';
import { symptomSummary } from '../lib/dayMarkers.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate } from '../lib/format.ts';
import { APPETITE_MAX, APPETITE_MIN, SIDE_EFFECTS } from '../lib/glp1.ts';
import type { AppData } from '../lib/useAppData.ts';
import { parseSymptomFields } from '../lib/validation.ts';

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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
    setStatus(`${existing ? 'Uppdaterade' : 'Sparade'} måendet för ${formatDate(day)}.`);
  }

  async function handleDelete(day: string) {
    if (confirmDelete !== day) {
      setConfirmDelete(day);
      return;
    }
    await deleteSymptoms(day);
    await onChange();
    setConfirmDelete(null);
    if (day === date) setFields(fieldsFor(undefined));
    setStatus('Måendet är borttaget.');
  }

  const recent = [...data.symptoms].slice(-RECENT_SYMPTOMS).reverse();

  return (
    <>
      <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <h2 className="card-title">Mående</h2>
        <p className="form-note">Valfritt. Fyll i det du vill – aptit, biverkningar eller båda.</p>
        <label className="field">
          <span className="field-label">Datum</span>
          <input
            className="input"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => {
              changeDate(e.target.value);
            }}
          />
        </label>
        <fieldset className="choice-group">
          <legend className="field-label">Aptit (1 = ingen, 5 = stor)</legend>
          <div className="segmented">
            {APPETITE_LEVELS.map((level) => {
              const value = String(level);
              return (
                <button
                  key={value}
                  type="button"
                  className="segmented-button"
                  aria-pressed={fields.appetite === value}
                  aria-label={`Aptit ${value}`}
                  onClick={() => {
                    setFields((f) => ({ ...f, appetite: f.appetite === value ? '' : value }));
                  }}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="choice-group">
          <legend className="field-label">Biverkningar</legend>
          <div className="chip-grid">
            {SIDE_EFFECTS.map((effect) => (
              <button
                key={effect}
                type="button"
                className="chip"
                aria-pressed={fields.sideEffects.includes(effect)}
                onClick={() => {
                  toggleEffect(effect);
                }}
              >
                {effect}
              </button>
            ))}
          </div>
        </fieldset>
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
        <p className="form-ok" role="status">
          {status}
        </p>
      </form>
      {recent.length > 0 && (
        <section className="card" aria-labelledby="symptoms-title">
          <h2 className="card-title" id="symptoms-title">
            Senaste dagarna
          </h2>
          <ul className="entry-list">
            {recent.map((s) => (
              <li key={s.date} className="entry" data-testid="symptom">
                <div className="entry-main">
                  <span className="entry-weight">{formatDate(s.date)}</span>
                </div>
                <p className="entry-extra">{symptomSummary(s)}</p>
                <div className="entry-actions">
                  <button
                    type="button"
                    className="button button-danger button-small"
                    onClick={() => void handleDelete(s.date)}
                  >
                    {confirmDelete === s.date ? 'Bekräfta borttagning' : 'Ta bort'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
