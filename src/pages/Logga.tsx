import { useState, type SyntheticEvent } from 'react';
import { Page } from '../components/Page.tsx';
import {
  deleteMeasurement,
  newId,
  putMeasurement,
  type Measurement,
  type Profile,
} from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate, formatInt, formatKg, parseDecimal, stepKg } from '../lib/format.ts';
import { useAppData } from '../lib/useAppData.ts';
import { parseMeasurement } from '../lib/validation.ts';

interface FormState {
  editingId: string | null;
  date: string;
  weight: string;
  waist: string;
  steps: string;
  note: string;
}

function kgText(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

/** Tomt formulär för dagens datum, förifyllt med senaste vikten (eller startvikten). */
function freshForm(measurements: readonly Measurement[], profile: Profile | null): FormState {
  const latest = measurements[measurements.length - 1];
  const weight = latest?.weightKg ?? profile?.startWeightKg;
  return {
    editingId: null,
    date: todayIso(),
    weight: weight == null ? '' : kgText(weight),
    waist: '',
    steps: '',
    note: '',
  };
}

function formFor(entry: Measurement): FormState {
  return {
    editingId: entry.id,
    date: entry.date,
    weight: kgText(entry.weightKg),
    waist: entry.waistCm == null ? '' : String(entry.waistCm).replace('.', ','),
    steps: entry.steps == null ? '' : String(entry.steps),
    note: entry.note ?? '',
  };
}

export function Logga() {
  const { data, reload } = useAppData();
  return (
    <Page title="Logga">
      {data && (
        <LogForm measurements={data.measurements} profile={data.profile} onChange={reload} />
      )}
    </Page>
  );
}

interface LogFormProps {
  measurements: Measurement[];
  profile: Profile | null;
  onChange: () => Promise<void>;
}

function LogForm({ measurements, profile, onChange }: LogFormProps) {
  const [form, setForm] = useState<FormState>(() => freshForm(measurements, profile));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const editing = measurements.find((m) => m.id === form.editingId) ?? null;

  function update(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function nudge(delta: number) {
    const current = parseDecimal(form.weight);
    if (current == null) return;
    update({ weight: kgText(stepKg(current, delta)) });
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseMeasurement(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const now = Date.now();
    const entry: Measurement = editing
      ? { id: editing.id, createdAt: editing.createdAt, updatedAt: now, ...result.value }
      : { id: newId(), createdAt: now, ...result.value };
    await putMeasurement(entry);
    await onChange();
    // Behåll vikten som förifyllt värde till nästa gång.
    setForm({ ...freshForm([], null), weight: kgText(entry.weightKg) });
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
    await deleteMeasurement(id);
    await onChange();
    setConfirmDeleteId(null);
    if (form.editingId === id) setForm(freshForm([], null));
    setStatus('Mätningen är borttagen.');
  }

  const newestFirst = [...measurements].reverse();

  return (
    <>
      <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <h2 className="card-title">{editing ? 'Redigera mätning' : 'Dagens vikt'}</h2>
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
          <div className="stepper">
            <button
              type="button"
              className="button button-secondary stepper-button"
              aria-label="Minska vikten med 0,1 kg"
              onClick={() => {
                nudge(-0.1);
              }}
            >
              −0,1
            </button>
            <input
              id="weight-input"
              className="input stepper-input"
              inputMode="decimal"
              autoComplete="off"
              value={form.weight}
              onChange={(e) => {
                update({ weight: e.target.value });
              }}
            />
            <button
              type="button"
              className="button button-secondary stepper-button"
              aria-label="Öka vikten med 0,1 kg"
              onClick={() => {
                nudge(0.1);
              }}
            >
              +0,1
            </button>
          </div>
        </div>
        <details className="more" open={Boolean(form.waist || form.steps || form.note)}>
          <summary>Midjemått, steg och anteckning</summary>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Midjemått (cm)</span>
              <input
                className="input"
                inputMode="decimal"
                autoComplete="off"
                value={form.waist}
                onChange={(e) => {
                  update({ waist: e.target.value });
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Steg</span>
              <input
                className="input"
                inputMode="numeric"
                autoComplete="off"
                value={form.steps}
                onChange={(e) => {
                  update({ steps: e.target.value });
                }}
              />
            </label>
          </div>
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
        </details>
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
                setForm(freshForm(measurements, profile));
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
          Mätningar
        </h2>
        {newestFirst.length === 0 ? (
          <p className="muted">Inga mätningar ännu.</p>
        ) : (
          <ul className="entry-list">
            {newestFirst.map((m) => (
              <li key={m.id} className="entry" data-testid="entry">
                <div className="entry-main">
                  <span className="entry-date">{formatDate(m.date)}</span>
                  <span className="entry-weight">{formatKg(m.weightKg)}</span>
                </div>
                {(m.waistCm != null || m.steps != null || m.note) && (
                  <p className="entry-extra">
                    {[
                      m.waistCm != null ? `Midja ${String(m.waistCm).replace('.', ',')} cm` : null,
                      m.steps != null ? `${formatInt(m.steps)} steg` : null,
                      m.note ?? null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                <div className="entry-actions">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    aria-label={`Redigera ${formatDate(m.date)}`}
                    onClick={() => {
                      setForm(formFor(m));
                      setConfirmDeleteId(null);
                      setError(null);
                      window.scrollTo({ top: 0 });
                    }}
                  >
                    Redigera
                  </button>
                  <button
                    type="button"
                    className="button button-danger button-small"
                    aria-label={
                      confirmDeleteId === m.id
                        ? `Bekräfta borttagning av ${formatDate(m.date)}`
                        : `Ta bort ${formatDate(m.date)}`
                    }
                    onClick={() => void handleDelete(m.id)}
                  >
                    {confirmDeleteId === m.id ? 'Bekräfta' : 'Ta bort'}
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
