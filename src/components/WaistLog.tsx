import { useState, type SyntheticEvent } from 'react';
import { deleteWaist, putWaist, upsertWaist, type WaistEntry } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatCm, formatDate } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { parseWaistFields } from '../lib/validation.ts';
import { haptic } from '../lib/haptics.ts';
import { Card } from './Card.tsx';
import { DateBar } from './DateBar.tsx';
import { ListRow } from './ListRow.tsx';
import { Toast } from './Toast.tsx';

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
  const toast = useUndoToast();
  const existing = waist.find((w) => w.date === date);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseWaistFields({ date, waist: value });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await upsertWaist(result.value.date, result.value.waistCm);
    haptic('success');
    const next = await onChange();
    setValue(latestWaistText(next.waist));
    setError(null);
    toast.close();
    setStatus(
      `${existing ? 'Uppdaterade' : 'Sparade'} ${formatCm(result.value.waistCm)} för ${formatDate(result.value.date)}.`,
    );
  }

  /** Tar bort direkt (svep eller "Ta bort" för vald dag) – Ångra lägger tillbaka måttet. */
  async function remove(entry: WaistEntry) {
    await deleteWaist(entry.date);
    await onChange();
    setStatus(null);
    toast.show(`Tog bort ${formatCm(entry.waistCm)} ${formatDate(entry.date)}.`, async () => {
      await putWaist(entry);
      await onChange();
    });
  }

  const recent = waist.slice(-RECENT_WAIST).reverse();

  return (
    <>
      <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <DateBar
          date={date}
          today={todayIso()}
          label="Datum"
          testId="log-date"
          onChange={setDate}
        />
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
        {existing && (
          <button
            type="button"
            className="button button-ghost button-small button-danger-text"
            onClick={() => void remove(existing)}
          >
            Ta bort måttet
          </button>
        )}
        <p className="form-ok" role="status">
          {status}
        </p>
      </form>

      <Card title="Senaste måtten">
        {recent.length === 0 ? (
          <p className="muted">Inga midjemått ännu.</p>
        ) : (
          <ul className="list">
            {recent.map((w) => (
              <ListRow
                key={w.date}
                testId="waist-entry"
                primary={formatDate(w.date)}
                value={formatCm(w.waistCm)}
                onClick={() => {
                  setDate(w.date);
                  setValue(cmText(w.waistCm));
                  setError(null);
                  setStatus(null);
                }}
                swipeLeft={{ label: 'Ta bort', onSwipe: () => void remove(w) }}
              />
            ))}
          </ul>
        )}
      </Card>
      {toast.toast && (
        <Toast
          label="Midja"
          testId="log-toast"
          message={toast.toast.message}
          onUndo={toast.onUndo}
          onClose={toast.close}
        />
      )}
    </>
  );
}
