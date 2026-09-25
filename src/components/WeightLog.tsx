import { useRef, useState, type SyntheticEvent } from 'react';
import { deleteWeight, newId, putWeight, type Profile, type WeightEntry } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate, formatKg, parseDecimal, stepKg } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { parseWeightFields } from '../lib/validation.ts';

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
    const next = await onChange();
    setForm(freshWeightForm(next.weights, next.profile));
    setError(null);
    setStatus(
      `${editing ? 'Uppdaterade' : 'Sparade'} ${formatKg(entry.weightKg)} för ${formatDate(entry.date)}.`,
    );
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    await deleteWeight(id);
    const next = await onChange();
    setConfirmDeleteId(null);
    if (form.editingId === id) setForm(freshWeightForm(next.weights, next.profile));
    setStatus('Mätningen är borttagen.');
  }

  const newestFirst = [...weights].reverse();

  return (
    <>
      <form className="card form" ref={formRef} onSubmit={(e) => void handleSubmit(e)} noValidate>
        <h2 className="card-title">{editing ? 'Redigera vikt' : 'Dagens vikt'}</h2>
        <label className="field">
          <span className="field-label">Datum</span>
          <input
            className="input"
            type="date"
            value={form.date}
            max={todayIso()}
            onChange={(e) => {
              update({ date: e.target.value });
            }}
          />
        </label>
        <div className="field">
          <label className="field-label" htmlFor="weight-input">
            Vikt (kg)
          </label>
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
          <div className="nudge-row">
            <button
              type="button"
              className="button button-secondary"
              aria-label="Minska vikten med 0,1 kg"
              onClick={() => {
                nudge(-0.1);
              }}
            >
              −0,1
            </button>
            <button
              type="button"
              className="button button-secondary"
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
        <p className="form-ok" role="status">
          {status}
        </p>
      </form>

      <section className="card" aria-labelledby="entries-title">
        <h2 className="card-title" id="entries-title">
          Viktmätningar
        </h2>
        {newestFirst.length === 0 ? (
          <p className="muted">Inga mätningar ännu.</p>
        ) : (
          <ul className="entry-list">
            {newestFirst.map((w) => (
              <li key={w.id} className="entry" data-testid="entry">
                <div className="entry-main">
                  <span className="entry-date">{formatDate(w.date)}</span>
                  <span className="entry-weight">{formatKg(w.weightKg)}</span>
                </div>
                {w.note && <p className="entry-extra">{w.note}</p>}
                <div className="entry-actions">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    aria-label={`Redigera ${formatDate(w.date)}`}
                    onClick={() => {
                      setForm(weightFormFor(w));
                      setConfirmDeleteId(null);
                      setError(null);
                      formRef.current?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    Redigera
                  </button>
                  <button
                    type="button"
                    className="button button-danger button-small"
                    aria-label={
                      confirmDeleteId === w.id
                        ? `Bekräfta borttagning av ${formatDate(w.date)}`
                        : `Ta bort ${formatDate(w.date)}`
                    }
                    onClick={() => void handleDelete(w.id)}
                  >
                    {confirmDeleteId === w.id ? 'Bekräfta' : 'Ta bort'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
