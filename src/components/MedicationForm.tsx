import { useState, type SyntheticEvent } from 'react';
import { newId, putMedication, type Medication } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { doseInput } from '../lib/format.ts';
import { DOSE_FREQUENCIES, PRESCRIBER_NOTE, PRESET_MEDICATIONS } from '../lib/glp1.ts';
import { parseMedicationFields } from '../lib/validation.ts';
import { WEEKDAYS } from '../lib/workouts.ts';

const OTHER = '__annat';

interface StepRow {
  key: string;
  date: string;
  dose: string;
}

interface MedicationFormProps {
  /** Läkemedlet som ändras. Saknas → nytt läkemedel. */
  medication?: Medication;
  onSaved: (medication: Medication) => Promise<unknown>;
  onCancel?: () => void;
}

function rowsFor(medication: Medication | undefined): StepRow[] {
  if (!medication) return [{ key: newId(), date: todayIso(), dose: '' }];
  return medication.steps.map((s) => ({
    key: newId(),
    date: s.date,
    dose: doseInput(s.doseMg),
  }));
}

/**
 * Läkemedel, schema och dostrappa. Trappans steg (datum + dos) skrivs in för hand
 * enligt förskrivarens ordination – formuläret föreslår aldrig någon dos.
 */
export function MedicationForm({ medication, onSaved, onCancel }: MedicationFormProps) {
  const [name, setName] = useState(medication?.name ?? PRESET_MEDICATIONS[0] ?? '');
  const [custom, setCustom] = useState(
    () => medication != null && !PRESET_MEDICATIONS.includes(medication.name),
  );
  const [frequency, setFrequency] = useState<string>(medication?.frequency ?? 'vecka');
  const [weekday, setWeekday] = useState(String(medication?.weekday ?? 0));
  const [time, setTime] = useState(medication?.time ?? '08:00');
  const [rows, setRows] = useState<StepRow[]>(() => rowsFor(medication));
  const [endDate, setEndDate] = useState(medication?.endDate ?? '');
  const [error, setError] = useState<string | null>(null);

  function updateRow(key: string, patch: Partial<StepRow>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const parsed = parseMedicationFields({ name, frequency, weekday, time, steps: rows, endDate });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const now = Date.now();
    const saved: Medication = medication
      ? { id: medication.id, ...parsed.value, createdAt: medication.createdAt, updatedAt: now }
      : { id: newId(), ...parsed.value, createdAt: now };
    await putMedication(saved);
    setError(null);
    await onSaved(saved);
  }

  return (
    <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <h2 className="card-title">{medication ? `Ändra ${medication.name}` : 'Nytt läkemedel'}</h2>
      <label className="field">
        <span className="field-label">Läkemedel</span>
        <select
          className="input"
          value={custom ? OTHER : name}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setCustom(true);
              setName('');
            } else {
              setCustom(false);
              setName(e.target.value);
            }
          }}
        >
          {PRESET_MEDICATIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value={OTHER}>Annat läkemedel…</option>
        </select>
      </label>
      {custom && (
        <label className="field">
          <span className="field-label">Namn</span>
          <input
            className="input"
            autoComplete="off"
            maxLength={60}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
      )}
      <fieldset className="choice-group">
        <legend className="field-label">Hur ofta</legend>
        <div className="segmented">
          {DOSE_FREQUENCIES.map((f) => (
            <button
              key={f.id}
              type="button"
              className="segmented-button"
              aria-pressed={frequency === f.id}
              onClick={() => {
                setFrequency(f.id);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="field-row">
        {frequency === 'vecka' && (
          <label className="field">
            <span className="field-label">Veckodag</span>
            <select
              className="input"
              value={weekday}
              onChange={(e) => {
                setWeekday(e.target.value);
              }}
            >
              {WEEKDAYS.map(([, long], day) => (
                <option key={long} value={String(day)}>
                  {long}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span className="field-label">Tid</span>
          <input
            className="input"
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
            }}
          />
        </label>
      </div>
      <fieldset className="choice-group">
        <legend className="field-label">Planerad dostrappa</legend>
        <p className="prescriber-note" data-testid="prescriber-note">
          {PRESCRIBER_NOTE}
        </p>
        <p className="form-note">
          Varje steg gäller från sitt datum tills nästa steg. Schemat börjar vid första steget.
        </p>
        <ol className="ladder" aria-label="Steg i dostrappan">
          {rows.map((row, i) => {
            const n = String(i + 1);
            return (
              <li key={row.key} className="ladder-row" data-testid="ladder-step">
                <label className="field">
                  <span className="field-label">Från</span>
                  <input
                    className="input"
                    type="date"
                    aria-label={`Från, steg ${n}`}
                    value={row.date}
                    onChange={(e) => {
                      updateRow(row.key, { date: e.target.value });
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Dos (mg)</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`Dos (mg), steg ${n}`}
                    value={row.dose}
                    onChange={(e) => {
                      updateRow(row.key, { dose: e.target.value });
                    }}
                  />
                </label>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    aria-label={`Ta bort steg ${n}`}
                    onClick={() => {
                      setRows((current) => current.filter((r) => r.key !== row.key));
                    }}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => {
            setRows((current) => [...current, { key: newId(), date: '', dose: '' }]);
          }}
        >
          Lägg till steg
        </button>
      </fieldset>
      <label className="field">
        <span className="field-label">Slutdatum (valfri)</span>
        <input
          className="input"
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
          }}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button">
        {medication ? 'Spara ändringar' : 'Spara läkemedel'}
      </button>
      {onCancel && (
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Avbryt
        </button>
      )}
    </form>
  );
}
