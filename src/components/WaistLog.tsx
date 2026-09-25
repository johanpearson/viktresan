import { useState, type SyntheticEvent } from 'react';
import { deleteWaist, upsertWaist, type WaistEntry } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatCm, formatDate } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { parseWaistFields } from '../lib/validation.ts';

/** Antal midjemått som visas i listan under formuläret. */
const RECENT_WAIST = 5;

function cmText(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

function latestWaistText(waist: readonly WaistEntry[]): string {
  const latest = waist[waist.length - 1];
  return latest ? cmText(latest.waistCm) : '';
}

/** Logga → Midja: ett mått per dag och de senaste måtten. */
interface WaistLogProps {
  waist: WaistEntry[];
  onChange: () => Promise<AppData>;
}

export function WaistLog({ waist, onChange }: WaistLogProps) {
  const [date, setDate] = useState(todayIso);
  const [value, setValue] = useState(() => latestWaistText(waist));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDeleteDate, setConfirmDeleteDate] = useState<string | null>(null);
  const existing = waist.find((w) => w.date === date);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseWaistFields({ date, waist: value });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await upsertWaist(result.value.date, result.value.waistCm);
    const next = await onChange();
    setValue(latestWaistText(next.waist));
    setError(null);
    setStatus(
      `${existing ? 'Uppdaterade' : 'Sparade'} ${formatCm(result.value.waistCm)} för ${formatDate(result.value.date)}.`,
    );
  }

  async function handleDelete(entryDate: string) {
    if (confirmDeleteDate !== entryDate) {
      setConfirmDeleteDate(entryDate);
      return;
    }
    await deleteWaist(entryDate);
    await onChange();
    setConfirmDeleteDate(null);
    setStatus('Midjemåttet är borttaget.');
  }

  const recent = waist.slice(-RECENT_WAIST).reverse();

  return (
    <>
      <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <h2 className="card-title">Midjemått</h2>
        <label className="field">
          <span className="field-label">Datum</span>
          <input
            className="input"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => {
              setDate(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Midjemått (cm)</span>
          <input
            className="input big-input"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
            }}
          />
        </label>
        {existing && (
          <p className="form-note" data-testid="waist-existing">
            {formatCm(existing.waistCm)} är redan loggat för dagen och ersätts när du sparar.
          </p>
        )}
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

      <section className="card" aria-labelledby="waist-title">
        <h2 className="card-title" id="waist-title">
          Senaste måtten
        </h2>
        {recent.length === 0 ? (
          <p className="muted">Inga midjemått ännu.</p>
        ) : (
          <ul className="entry-list">
            {recent.map((w) => (
              <li key={w.date} className="entry entry-compact" data-testid="waist-entry">
                <div className="entry-main">
                  <span className="entry-date">{formatDate(w.date)}</span>
                  <span className="entry-weight">{formatCm(w.waistCm)}</span>
                </div>
                <button
                  type="button"
                  className="button button-danger button-small"
                  aria-label={
                    confirmDeleteDate === w.date
                      ? `Bekräfta borttagning av midjemåttet ${formatDate(w.date)}`
                      : `Ta bort midjemåttet ${formatDate(w.date)}`
                  }
                  onClick={() => void handleDelete(w.date)}
                >
                  {confirmDeleteDate === w.date ? 'Bekräfta' : 'Ta bort'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
