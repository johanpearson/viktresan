import { useState } from 'react';
import { deleteMedication, putMedication, type Medication } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate, formatMg } from '../lib/format.ts';
import { describeSchedule, doseStepOn } from '../lib/glp1.ts';
import type { AppData } from '../lib/useAppData.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { ActionSheet } from './ActionSheet.tsx';
import { Card } from './Card.tsx';
import { ListRow } from './ListRow.tsx';
import { MedicationForm } from './MedicationForm.tsx';
import { Toast } from './Toast.tsx';

interface MedicationsProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Logga → GLP-1 → Läkemedel: läkemedel med schema och dostrappa. */
export function Medications({ data, onChange }: MedicationsProps) {
  const [editing, setEditing] = useState<Medication | null>(null);
  const [menu, setMenu] = useState<Medication | null>(null);
  const toast = useUndoToast();
  const [status, setStatus] = useState<string | null>(null);
  // Nytt nummer efter varje sparning så att formuläret börjar om tomt.
  const [formVersion, setFormVersion] = useState(0);
  const today = todayIso();

  async function handleSaved(med: Medication, wasEditing: boolean) {
    await onChange();
    setEditing(null);
    setFormVersion((v) => v + 1);
    toast.close();
    setStatus(wasEditing ? `${med.name} är uppdaterat.` : `${med.name} är sparat.`);
  }

  /** Tar bort läkemedlet direkt (svep eller radmenyn) – Ångra lägger tillbaka det. */
  async function remove(med: Medication) {
    await deleteMedication(med.id);
    await onChange();
    if (editing?.id === med.id) setEditing(null);
    setStatus(null);
    toast.show(`Tog bort ${med.name}. Loggade doser ligger kvar.`, async () => {
      await putMedication(med);
      await onChange();
    });
  }

  return (
    <>
      <Card title="Dina läkemedel">
        {data.medications.length === 0 ? (
          <p className="form-note">Inget läkemedel inlagt ännu.</p>
        ) : (
          <ul className="list">
            {data.medications.map((med) => {
              const current = doseStepOn(med.steps, today);
              return (
                <ListRow
                  key={med.id}
                  testId="medication"
                  primary={med.name}
                  secondary={describeSchedule(med)}
                  value={current ? `Nu ${formatMg(current.doseMg)}` : 'Inte påbörjat'}
                  onClick={() => {
                    setMenu(med);
                  }}
                  swipeLeft={{ label: 'Ta bort', onSwipe: () => void remove(med) }}
                >
                  <ol className="list-row-details" aria-label={`Dostrappa för ${med.name}`}>
                    {med.steps.map((s) => (
                      <li key={s.date}>
                        <span>Från {formatDate(s.date)}</span>
                        <span className="num">{formatMg(s.doseMg)}</span>
                      </li>
                    ))}
                    {med.endDate && (
                      <li>
                        <span>Slutar {formatDate(med.endDate)}</span>
                      </li>
                    )}
                  </ol>
                </ListRow>
              );
            })}
          </ul>
        )}
        <p className="form-ok" role="status">
          {status}
        </p>
      </Card>
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
      {menu && (
        <ActionSheet
          title={menu.name}
          description={describeSchedule(menu)}
          actions={[
            {
              label: 'Ändra',
              onSelect: () => {
                setEditing(menu);
                setStatus(null);
              },
            },
            { label: 'Ta bort', danger: true, onSelect: () => void remove(menu) },
          ]}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
      {toast.toast && (
        <Toast
          label="Läkemedel"
          testId="log-toast"
          message={toast.toast.message}
          onUndo={toast.onUndo}
          onClose={toast.close}
        />
      )}
    </>
  );
}
