import { useState, type SyntheticEvent } from 'react';
import { deleteInjection, newId, putInjection, type Injection } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { doseInput, formatDate, formatMg } from '../lib/format.ts';
import {
  INJECTION_SITES,
  PRESCRIBER_NOTE,
  describeDose,
  doseOn,
  isActive,
  nextDose,
  siteLabel,
  suggestSite,
  suggestedDose,
  type InjectionSite,
} from '../lib/glp1.ts';
import type { AppData } from '../lib/useAppData.ts';
import { parseInjectionFields } from '../lib/validation.ts';
import { localNow } from '../lib/workouts.ts';

/** Antal injektioner som visas under formuläret. */
const RECENT_INJECTIONS = 5;

interface InjectionFormProps {
  data: AppData;
  onChange: () => Promise<AppData>;
  /** Byter till fliken Läkemedel (när inget läkemedel finns). */
  onAddMedication: () => void;
}

/** Logga → GLP-1 → Dos: datum/tid, dos ur dostrappan och injektionsställe med förslag. */
export function InjectionForm({ data, onChange, onAddMedication }: InjectionFormProps) {
  const today = todayIso();
  const active = data.medications.filter((m) => isActive(m, today));
  const choices = active.length > 0 ? active : data.medications;
  const [medicationId, setMedicationId] = useState(
    () => nextDose(choices, data.injections, new Date())?.medicationId ?? choices[0]?.id ?? '',
  );
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(() => localNow(new Date()).time);
  // Dos och ställe följer förslagen tills användaren ändrar dem.
  const [doseText, setDoseText] = useState<string | null>(null);
  const [chosenSite, setChosenSite] = useState<InjectionSite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (data.medications.length === 0) {
    return (
      <section className="card">
        <h2 className="card-title">Logga dos</h2>
        <p className="form-note">Lägg in ditt läkemedel och din dostrappa först.</p>
        <button type="button" className="button" onClick={onAddMedication}>
          Lägg in läkemedel
        </button>
      </section>
    );
  }

  const medication = choices.find((m) => m.id === medicationId) ?? choices[0];
  const suggested = medication ? suggestedDose(medication, data.injections, date) : null;
  const ladderDose = medication ? doseOn(medication, date) : null;
  const dose = doseText ?? (suggested == null ? '' : doseInput(suggested));
  const suggestedSite = suggestSite(data.injections);
  const site = chosenSite ?? suggestedSite;

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (!medication) return;
    const parsed = parseInjectionFields({ date, time, dose, site });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const injection: Injection = {
      id: newId(),
      ...parsed.value,
      medicationId: medication.id,
      medicationName: medication.name,
      createdAt: Date.now(),
    };
    await putInjection(injection);
    await onChange();
    setError(null);
    setDoseText(null);
    setChosenSite(null);
    const where = injection.site ? `, ${siteLabel(injection.site).toLowerCase()}` : '';
    setStatus(`Dosen är loggad: ${describeDose(injection)}${where}.`);
  }

  async function handleDelete(injection: Injection) {
    if (confirmDelete !== injection.id) {
      setConfirmDelete(injection.id);
      return;
    }
    await deleteInjection(injection.id);
    await onChange();
    setConfirmDelete(null);
    setStatus('Dosen är borttagen.');
  }

  const recent = data.injections.slice(-RECENT_INJECTIONS).reverse();

  return (
    <>
      <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <h2 className="card-title">Logga dos</h2>
        {choices.length > 1 ? (
          <label className="field">
            <span className="field-label">Läkemedel</span>
            <select
              className="input"
              value={medication?.id ?? ''}
              onChange={(e) => {
                setMedicationId(e.target.value);
                setDoseText(null);
              }}
            >
              {choices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="dose-next" data-testid="injection-medication">
            {medication?.name}
          </p>
        )}
        <div className="field-row">
          <label className="field">
            <span className="field-label">Datum</span>
            <input
              className="input"
              type="date"
              value={date}
              max={today}
              onChange={(e) => {
                setDate(e.target.value);
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Tid (valfri)</span>
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
        <label className="field">
          <span className="field-label">Dos (mg)</span>
          <input
            className="input"
            inputMode="decimal"
            autoComplete="off"
            aria-describedby="injection-dose-hint"
            value={dose}
            onChange={(e) => {
              setDoseText(e.target.value);
            }}
          />
        </label>
        <p className="form-note" id="injection-dose-hint">
          {ladderDose == null
            ? 'Ingen dos i din dostrappa för datumet.'
            : `Enligt din dostrappa: ${formatMg(ladderDose)}.`}{' '}
          {PRESCRIBER_NOTE}
        </p>
        <fieldset className="choice-group">
          <legend className="field-label">Injektionsställe</legend>
          <div className="site-grid">
            {INJECTION_SITES.map((s) => (
              <button
                key={s.id}
                type="button"
                className="site-button"
                aria-pressed={site === s.id}
                data-site={s.id}
                onClick={() => {
                  setChosenSite(s.id);
                }}
              >
                {s.label}
                {s.id === suggestedSite && <span className="site-hint">Förslag</span>}
              </button>
            ))}
          </div>
          <p className="form-note" data-testid="site-suggestion">
            Förslag för rotation: {siteLabel(suggestedSite).toLowerCase()}.
          </p>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button">
          Spara dos
        </button>
        <p className="form-ok" role="status">
          {status}
        </p>
      </form>
      {recent.length > 0 && (
        <section className="card" aria-labelledby="injections-title">
          <h2 className="card-title" id="injections-title">
            Senaste doser
          </h2>
          <ul className="entry-list">
            {recent.map((i) => (
              <li key={i.id} className="entry" data-testid="injection">
                <div className="entry-main">
                  <span className="entry-weight">{describeDose(i)}</span>
                  <span>
                    {formatDate(i.date)}
                    {i.time ? ` ${i.time}` : ''}
                  </span>
                </div>
                {i.site && <p className="entry-extra">{siteLabel(i.site)}</p>}
                <div className="entry-actions">
                  <button
                    type="button"
                    className="button button-danger button-small"
                    onClick={() => void handleDelete(i)}
                  >
                    {confirmDelete === i.id ? 'Bekräfta borttagning' : 'Ta bort'}
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
