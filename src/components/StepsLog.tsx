import { useState, type SyntheticEvent } from 'react';
import { upsertSteps, type StepsEntry } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate, formatInt } from '../lib/format.ts';
import { dailySteps, filterRange, type RangeId } from '../lib/stats.ts';
import type { AppData } from '../lib/useAppData.ts';
import { parseStepsFields } from '../lib/validation.ts';
import { EmptyState } from './Page.tsx';
import { RangeFilter } from './RangeFilter.tsx';
import { StepsChart } from './StepsChart.tsx';

interface StepsLogProps {
  steps: StepsEntry[];
  onChange: () => Promise<AppData>;
}

/** Logga → Steg: dagens steg och stapelgraf. */
export function StepsLog({ steps, onChange }: StepsLogProps) {
  const [range, setRange] = useState<RangeId>('1m');
  const all = dailySteps(steps);
  const days = filterRange(all, range, todayIso());
  const average = days.length > 0 ? days.reduce((s, d) => s + d.steps, 0) / days.length : null;

  return (
    <>
      <StepsForm steps={steps} onChange={onChange} />
      {all.length === 0 ? (
        <EmptyState>Inga steg loggade ännu.</EmptyState>
      ) : (
        <>
          <RangeFilter value={range} onChange={setRange} />
          {days.length === 0 ? (
            <EmptyState>Inga steg i vald period.</EmptyState>
          ) : (
            <div className="card chart-card">
              <StepsChart days={days} />
              {average != null && (
                <p className="muted" data-testid="steps-average">
                  Snitt {formatInt(Math.round(average))} steg per loggad dag.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function stepsFor(steps: readonly StepsEntry[], date: string): StepsEntry | undefined {
  return steps.find((s) => s.date === date);
}

interface StepsFormProps {
  steps: StepsEntry[];
  onChange: () => Promise<AppData>;
}

/** Ett värde per dag: finns dagen redan skrivs värdet över. */
function StepsForm({ steps, onChange }: StepsFormProps) {
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
