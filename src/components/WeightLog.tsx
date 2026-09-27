import { useRef, useState, type SyntheticEvent } from 'react';
import { deleteWeight, newId, putWeight, type Profile, type WeightEntry } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate, formatKg, parseDecimal, stepKg } from '../lib/format.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import type { AppData } from '../lib/useAppData.ts';
import { parseWeightFields } from '../lib/validation.ts';
import { haptic } from '../lib/haptics.ts';
import { Card } from './Card.tsx';
import { DateBar } from './DateBar.tsx';
import { ListRow } from './ListRow.tsx';
import { Toast } from './Toast.tsx';

function kgText(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

interface WeightForm {
  editingId: string | null;
  date: string;
  weight: string;
  note: string;
  showNote: boolean;
}

/**
 * Tomt formulär för dagens datum, förifyllt med den senast loggade vikten
 * (senaste datum; samma dag den senast registrerade) eller startvikten.
 */
function freshWeightForm(weights: readonly WeightEntry[], profile: Profile | null): WeightForm {
  const latest = weights[weights.length - 1];
  const weight = latest?.weightKg ?? profile?.startWeightKg;
  return {
    editingId: null,
    date: todayIso(),
    weight: weight == null ? '' : kgText(weight),
    note: '',
    showNote: false,
  };
}

function weightFormFor(entry: WeightEntry): WeightForm {
  return {
    editingId: entry.id,
    date: entry.date,
    weight: kgText(entry.weightKg),
    note: entry.note ?? '',
    showNote: entry.note != null,
  };
}

interface WeightLogProps {
  weights: WeightEntry[];
  profile: Profile | null;
  onChange: () => Promise<AppData>;
}

export function WeightLog({ weights, profile, onChange }: WeightLogProps) {
  const [form, setForm] = useState<WeightForm>(() => freshWeightForm(weights, profile));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const toast = useUndoToast();
  const formRef = useRef<HTMLFormElement>(null);
  const editing = weights.find((w) => w.id === form.editingId) ?? null;

  function update(patch: Partial<WeightForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function nudge(delta: number) {
    const current = parseDecimal(form.weight);
    if (current == null) return;
    update({ weight: kgText(stepKg(current, delta)) });
  }

  function edit(entry: WeightEntry) {
    setForm(weightFormFor(entry));
    setError(null);
    setStatus(null);
    formRef.current?.scrollIntoView({ block: 'start' });
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseWeightFields(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const now = Date.now();
    const entry: WeightEntry = editing
      ? { id: editing.id, createdAt: editing.createdAt, updatedAt: now, ...result.value }
      : { id: newId(), createdAt: now, ...result.value };
    await putWeight(entry);
    haptic('success');
    const next = await onChange();
    setForm(freshWeightForm(next.weights, next.profile));
    setError(null);
    toast.close();
    setStatus(
      `${editing ? 'Uppdaterade' : 'Sparade'} ${formatKg(entry.weightKg)} för ${formatDate(entry.date)}.`,
    );
  }

  /** Tar bort direkt (svep eller "Ta bort" vid redigering) – Ångra lägger tillbaka mätningen. */
  async function remove(entry: WeightEntry) {
    await deleteWeight(entry.id);
    const next = await onChange();
    if (form.editingId === entry.id) setForm(freshWeightForm(next.weights, next.profile));
    setStatus(null);
    toast.show(`Tog bort ${formatKg(entry.weightKg)} ${formatDate(entry.date)}.`, async () => {
      await putWeight(entry);
      await onChange();
    });
  }

  const newestFirst = [...weights].reverse();

  return (
    <>
      <form className="card form" ref={formRef} onSubmit={(e) => void handleSubmit(e)} noValidate>
        {editing && <h2 className="card-title">Redigera vikt</h2>}
        <DateBar
          date={form.date}
          today={todayIso()}
          label="Datum"
          testId="log-date"
          onChange={(date) => {
            update({ date });
          }}
        />
        <div className="field">
          <label className="field-label" htmlFor="weight-input">
            Vikt (kg)
          </label>
          <div className="nudge-field">
            <button
              type="button"
              className="button button-secondary button-small"
              aria-label="Minska vikten med 0,1 kg"
              onClick={() => {
                nudge(-0.1);
              }}
            >
              −0,1
            </button>
            <input
              id="weight-input"
              className="input big-input"
              inputMode="decimal"
              autoComplete="off"
              value={form.weight}
              onChange={(e) => {
                update({ weight: e.target.value });
              }}
            />
            <button
              type="button"
              className="button button-secondary button-small"
              aria-label="Öka vikten med 0,1 kg"
              onClick={() => {
                nudge(0.1);
              }}
            >
              +0,1
            </button>
          </div>
        </div>
        {form.showNote ? (
          <label className="field">
            <span className="field-label">Anteckning</span>
            <textarea
              className="input textarea"
              rows={2}
              value={form.note}
              onChange={(e) => {
                update({ note: e.target.value });
              }}
            />
          </label>
        ) : (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              update({ showNote: true });
            }}
          >
            Lägg till anteckning
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="button">
            {editing ? 'Spara ändringar' : 'Spara'}
          </button>
          {editing && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setForm(freshWeightForm(weights, profile));
                setError(null);
              }}
            >
              Avbryt
            </button>
          )}
        </div>
        {editing && (
          <button
            type="button"
            className="button button-ghost button-small button-danger-text"
            onClick={() => void remove(editing)}
          >
            Ta bort mätningen
          </button>
        )}
        <p className="form-ok" role="status">
          {status}
        </p>
      </form>

      <Card title="Viktmätningar">
        {newestFirst.length === 0 ? (
          <p className="muted">Inga mätningar ännu.</p>
        ) : (
          <ul className="list">
            {newestFirst.map((w) => (
              <ListRow
                key={w.id}
                testId="entry"
                primary={formatDate(w.date)}
                secondary={w.note}
                value={formatKg(w.weightKg)}
                onClick={() => {
                  edit(w);
                }}
                swipeLeft={{ label: 'Ta bort', onSwipe: () => void remove(w) }}
              />
            ))}
          </ul>
        )}
      </Card>
      {toast.toast && (
        <Toast
          label="Vikt"
          testId="log-toast"
          message={toast.toast.message}
          onUndo={toast.onUndo}
          onClose={toast.close}
        />
      )}
    </>
  );
}
