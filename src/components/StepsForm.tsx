import { useState, type SyntheticEvent } from 'react';
import { upsertSteps, type StepsEntry } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate, formatInt } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { parseStepsFields } from '../lib/validation.ts';

function stepsFor(steps: readonly StepsEntry[], date: string): StepsEntry | undefined {
  return steps.find((s) => s.date === date);
}

interface StepsFormProps {
  steps: StepsEntry[];
  onChange: () => Promise<AppData>;
}

/** Logga → Steg. Ett värde per dag: finns dagen redan skrivs värdet över. */
export function StepsForm({ steps, onChange }: StepsFormProps) {
  const [date, setDate] = useState(todayIso);
  const [value, setValue] = useState(() => {
    const existing = stepsFor(steps, todayIso());
    return existing ? String(existing.steps) : '';
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const existing = stepsFor(steps, date);

  function changeDate(next: string) {
    setDate(next);
    const entry = stepsFor(steps, next);
    setValue(entry ? String(entry.steps) : '');
    setStatus(null);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseStepsFields({ date, steps: value });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await upsertSteps(result.value.date, result.value.steps);
    await onChange();
    setValue(String(result.value.steps));
    setError(null);
    setStatus(
      `${existing ? 'Uppdaterade' : 'Sparade'} ${formatInt(result.value.steps)} steg för ${formatDate(result.value.date)}.`,
    );
  }

  return (
    <form className="card form steps-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <h2 className="card-title">{date === todayIso() ? 'Dagens steg' : 'Steg'}</h2>
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
      <label className="field">
        <span className="field-label">Antal steg</span>
        <input
          className="input big-input"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
        />
      </label>
      <p className="form-note" data-testid="steps-existing">
        {existing
          ? `Loggat för dagen: ${formatInt(existing.steps)} steg. Sparar du ersätts värdet.`
          : 'Inget loggat för dagen ännu.'}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button">
        Spara
      </button>
      <p className="form-ok" role="status">
        {status}
      </p>
    </form>
  );
}
