import { useState } from 'react';
import { deleteMedication, type Medication } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate, formatMg } from '../lib/format.ts';
import { describeSchedule, doseStepOn } from '../lib/glp1.ts';
import type { AppData } from '../lib/useAppData.ts';
import { MedicationForm } from './MedicationForm.tsx';

interface MedicationsProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Logga → GLP-1 → Läkemedel: läkemedel med schema och dostrappa. */
export function Medications({ data, onChange }: MedicationsProps) {
  const [editing, setEditing] = useState<Medication | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Nytt nummer efter varje sparning så att formuläret börjar om tomt.
  const [formVersion, setFormVersion] = useState(0);
  const today = todayIso();

  async function handleSaved(med: Medication, wasEditing: boolean) {
    await onChange();
    setEditing(null);
    setFormVersion((v) => v + 1);
    setStatus(wasEditing ? `${med.name} är uppdaterat.` : `${med.name} är sparat.`);
  }

  async function handleDelete(med: Medication) {
    if (confirmDelete !== med.id) {
      setConfirmDelete(med.id);
      return;
    }
    await deleteMedication(med.id);
    await onChange();
    setConfirmDelete(null);
    setStatus(`${med.name} är borttaget. Loggade doser ligger kvar.`);
  }

  return (
    <>
      <section className="card" aria-labelledby="medications-title">
        <h2 className="card-title" id="medications-title">
          Dina läkemedel
        </h2>
        {data.medications.length === 0 ? (
          <p className="form-note">Inget läkemedel inlagt ännu.</p>
        ) : (
          <ul className="entry-list">
            {data.medications.map((med) => {
              const current = doseStepOn(med.steps, today);
              return (
                <li key={med.id} className="entry" data-testid="medication">
                  <div className="entry-main">
                    <span className="entry-weight">{med.name}</span>
                    <span>{describeSchedule(med)}</span>
                  </div>
                  <p className="entry-extra">
                    {current ? `Nu ${formatMg(current.doseMg)}` : 'Inte påbörjat'}
                    {med.endDate ? ` · till ${formatDate(med.endDate)}` : ''}
                  </p>
                  <ol className="dose-changes" aria-label={`Dostrappa för ${med.name}`}>
                    {med.steps.map((s) => (
                      <li key={s.date}>
                        <span>Från {formatDate(s.date)}</span>
                        <span>{formatMg(s.doseMg)}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="entry-actions">
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => {
                        setEditing(med);
                        setStatus(null);
                      }}
                    >
                      Ändra
                    </button>
                    <button
                      type="button"
                      className="button button-danger button-small"
                      onClick={() => void handleDelete(med)}
                    >
                      {confirmDelete === med.id ? 'Bekräfta borttagning' : 'Ta bort'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="form-ok" role="status">
          {status}
        </p>
      </section>
      <MedicationForm
        key={editing?.id ?? `ny-${String(formVersion)}`}
        {...(editing
          ? {
              medication: editing,
              onCancel: () => {
                setEditing(null);
              },
            }
          : {})}
        onSaved={(med) => handleSaved(med, editing !== null)}
      />
    </>
  );
}
