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
import { useUndoToast } from '../lib/useUndoToast.ts';
import { parseInjectionFields } from '../lib/validation.ts';
import { localNow } from '../lib/workouts.ts';
import { haptic } from '../lib/haptics.ts';
import { ActionSheet } from './ActionSheet.tsx';
import { Card } from './Card.tsx';
import { DateBar } from './DateBar.tsx';
import { EmptyState } from './EmptyState.tsx';
import { ListRow } from './ListRow.tsx';
import { Toast } from './Toast.tsx';

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
  const [menu, setMenu] = useState<Injection | null>(null);
  const toast = useUndoToast();

  if (data.medications.length === 0) {
    return (
      <EmptyState
        title="Inget läkemedel ännu"
        action={{ label: 'Lägg in läkemedel', onClick: onAddMedication }}
      >
        Lägg in ditt läkemedel och din dostrappa först.
      </EmptyState>
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
    haptic('success');
    await onChange();
    setError(null);
    setDoseText(null);
    setChosenSite(null);
    toast.close();
    const where = injection.site ? `, ${siteLabel(injection.site).toLowerCase()}` : '';
    setStatus(`Dosen är loggad: ${describeDose(injection)}${where}.`);
  }

  /** Tar bort dosen direkt (svep eller radmenyn) – Ångra lägger tillbaka den. */
  async function remove(injection: Injection) {
    await deleteInjection(injection.id);
    await onChange();
    setStatus(null);
    toast.show(`Tog bort ${describeDose(injection)} ${formatDate(injection.date)}.`, async () => {
      await putInjection(injection);
      await onChange();
    });
  }

  const recent = data.injections.slice(-RECENT_INJECTIONS).reverse();

  return (
    <>
      <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
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
        <DateBar date={date} today={today} label="Datum" testId="log-date" onChange={setDate} />
        <div className="field-row">
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
        </div>
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
        <Card title="Senaste doser">
          <ul className="list">
            {recent.map((i) => (
              <ListRow
                key={i.id}
                testId="injection"
                primary={describeDose(i)}
                secondary={[
                  `${formatDate(i.date)}${i.time ? ` ${i.time}` : ''}`,
                  i.site && siteLabel(i.site),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() => {
                  setMenu(i);
                }}
                swipeLeft={{ label: 'Ta bort', onSwipe: () => void remove(i) }}
              />
            ))}
          </ul>
        </Card>
      )}
      {menu && (
        <ActionSheet
          title={describeDose(menu)}
          description={[
            `${formatDate(menu.date)}${menu.time ? ` ${menu.time}` : ''}`,
            menu.site && siteLabel(menu.site),
          ]
            .filter(Boolean)
            .join(' · ')}
          actions={[{ label: 'Ta bort dosen', danger: true, onSelect: () => void remove(menu) }]}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
      {toast.toast && (
        <Toast
          label="GLP-1"
          testId="log-toast"
          message={toast.toast.message}
          onUndo={toast.onUndo}
          onClose={toast.close}
        />
      )}
    </>
  );
}
