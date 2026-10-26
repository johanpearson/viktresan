import { useState } from 'react';
import { deleteWorkoutPlan, putWorkoutPlan, type WorkoutPlan } from '../db/db.ts';
import { formatDate } from '../lib/format.ts';
import { planRemovalText } from '../lib/removal.ts';
import type { AppData } from '../lib/useAppData.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { describePlan, describeWorkout, workoutTypes } from '../lib/workouts.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { Card } from './Card.tsx';
import { DetailSheet } from './DetailSheet.tsx';
import { ListRow } from './ListRow.tsx';
import { Toast } from './Toast.tsx';
import { WorkoutPlanForm } from './WorkoutPlanForm.tsx';

interface WorkoutPlansProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Logga → Träning → Återkommande: scheman som mån/ons/fre 07:00. */
export function WorkoutPlans({ data, onChange }: WorkoutPlansProps) {
  const [menu, setMenu] = useState<WorkoutPlan | null>(null);
  const [editing, setEditing] = useState<WorkoutPlan | null>(null);
  const toast = useUndoToast();

  /** Tar bort schemat (svep direkt, detaljvyn efter bekräftelse) – Ångra lägger tillbaka det. */
  async function remove(plan: WorkoutPlan) {
    setMenu(null);
    await deleteWorkoutPlan(plan.id);
    await onChange();
    toast.show(`Tog bort schemat ${plan.type}. Besvarade pass ligger kvar.`, async () => {
      await putWorkoutPlan(plan);
      await onChange();
    });
  }

  return (
    <>
      <Card title="Återkommande pass">
        {data.workoutPlans.length === 0 ? (
          <p className="form-note">Inga scheman ännu.</p>
        ) : (
          <ul className="list">
            {data.workoutPlans.map((plan) => (
              <ListRow
                key={plan.id}
                testId="workout-plan"
                primary={describeWorkout(plan)}
                secondary={`${describePlan(plan)} · från ${formatDate(plan.startDate)}${
                  plan.endDate ? ` till ${formatDate(plan.endDate)}` : ''
                }`}
                chevron
                onClick={() => {
                  setMenu(plan);
                }}
                swipeLeft={{ label: 'Ta bort', onSwipe: () => void remove(plan) }}
              />
            ))}
          </ul>
        )}
      </Card>
      <WorkoutPlanForm
        types={workoutTypes(data.workouts, data.workoutPlans)}
        onSaved={async (plan) => {
          await onChange();
          toast.close();
          return `Schemat är sparat: ${plan.type} ${describePlan(plan)}.`;
        }}
      />
      {menu && (
        <DetailSheet
          title={menu.type}
          testId="plan-detail"
          onClose={() => {
            setMenu(null);
          }}
          onEdit={() => {
            toast.close();
            setEditing(menu);
            setMenu(null);
          }}
          remove={{
            label: 'Ta bort schemat',
            title: `Ta bort schemat ${menu.type}?`,
            consequence: planRemovalText(),
            onConfirm: () => void remove(menu),
          }}
        >
          <ListRow primary="Pass" value={describeWorkout(menu)} wrapValue />
          <ListRow primary="När" value={describePlan(menu)} wrapValue />
          <ListRow
            primary="Period"
            value={`från ${formatDate(menu.startDate)}${menu.endDate ? ` till ${formatDate(menu.endDate)}` : ''}`}
            wrapValue
          />
        </DetailSheet>
      )}
      {editing && (
        <BottomSheet
          title="Redigera schema"
          onClose={() => {
            setEditing(null);
          }}
        >
          <WorkoutPlanForm
            types={workoutTypes(data.workouts, data.workoutPlans)}
            plan={editing}
            onSaved={async (plan) => {
              setEditing(null);
              await onChange();
              toast.show(`Sparade schemat ${plan.type}.`);
              return null;
            }}
            onCancel={() => {
              setEditing(null);
            }}
          />
        </BottomSheet>
      )}
      {toast.toast && (
        <Toast
          label="Träning"
          testId="log-toast"
          message={toast.toast.message}
          onUndo={toast.onUndo}
          onClose={toast.close}
        />
      )}
    </>
  );
}
