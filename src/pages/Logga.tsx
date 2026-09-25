import { useState, type SyntheticEvent } from 'react';
import { Page } from '../components/Page.tsx';
import {
  deleteWaist,
  deleteWeight,
  newId,
  putWeight,
  upsertWaist,
  type Profile,
  type WaistEntry,
  type WeightEntry,
} from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatCm, formatDate, formatKg, parseDecimal, stepKg } from '../lib/format.ts';
import { useAppData, type AppData } from '../lib/useAppData.ts';
import { parseWaistFields, parseWeightFields } from '../lib/validation.ts';

type Tab = 'vikt' | 'midja';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'vikt', label: 'Vikt' },
  { id: 'midja', label: 'Midja' },
];

/** Antal midjemått som visas i listan under formuläret. */
const RECENT_WAIST = 5;

function decimalText(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

function kgText(value: number): string {
  return decimalText(value, 1);
}

function cmText(value: number): string {
  return Number.isInteger(value) ? String(value) : decimalText(value, 1);
}

export function Logga() {
  const { data, reload } = useAppData();
  const [tab, setTab] = useState<Tab>('vikt');

  return (
    <Page title="Logga">
      <div className="segmented segmented-2" role="group" aria-label="Vad vill du logga?">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="segmented-button"
            aria-pressed={t.id === tab}
            onClick={() => {
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {data &&
        (tab === 'vikt' ? (
          <WeightLog weights={data.weights} profile={data.profile} onChange={reload} />
        ) : (
          <WaistLog waist={data.waist} onChange={reload} />
        ))}
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Vikt

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

function WeightLog({ weights, profile, onChange }: WeightLogProps) {
  const [form, setForm] = useState<WeightForm>(() => freshWeightForm(weights, profile));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
      <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
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
                      window.scrollTo({ top: 0 });
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

// ---------------------------------------------------------------------------
// Midja

function latestWaistText(waist: readonly WaistEntry[]): string {
  const latest = waist[waist.length - 1];
  return latest ? cmText(latest.waistCm) : '';
}

interface WaistLogProps {
  waist: WaistEntry[];
  onChange: () => Promise<AppData>;
}

function WaistLog({ waist, onChange }: WaistLogProps) {
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
