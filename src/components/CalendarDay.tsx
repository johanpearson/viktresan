import { useState } from 'react';
import { deleteWorkout, putWorkout } from '../db/db.ts';
import type { LoggedValue } from '../lib/dayMarkers.ts';
import { formatDate } from '../lib/format.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import {
  answerWorkout,
  describeWorkout,
  displayStatus,
  DISPLAY_STATUS_LABELS,
  type WorkoutItem,
  type WorkoutStatus,
} from '../lib/workouts.ts';
import { ActionSheet, type SheetAction } from './ActionSheet.tsx';
import { Card } from './Card.tsx';
import { CompleteWorkoutSheet } from './CompleteWorkoutSheet.tsx';
import { ListRow } from './ListRow.tsx';
import { Parts } from './Parts.tsx';
import { Toast } from './Toast.tsx';

interface CalendarDayProps {
  date: string;
  /** Loggade värden (utom träning – passen listas var för sig). */
  logged: readonly LoggedValue[];
  workouts: readonly WorkoutItem[];
  now: Date;
  onChange: () => Promise<unknown>;
}

const weekdayFormat = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', timeZone: 'UTC' });

/** "Torsdag 24 sep. 2026". */
function dayTitle(iso: string): string {
  const weekday = weekdayFormat.format(new Date(`${iso}T12:00:00Z`));
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${formatDate(iso)}`;
}

/** Sparade pass som inte kommer ur ett schema kan tas bort (schemapass hoppas över). */
function removable(item: WorkoutItem): boolean {
  return item.stored && item.planId === undefined;
}

/**
 * Kalenderns dagsvy: en rad per loggtyp (prick i datatypens färg, värdet till höger) och
 * en rad per pass. Tryck på ett pass = radmeny (Klar, Hoppade över, Ta bort); svep vänster
 * tar bort med Ångra.
 */
export function CalendarDay({ date, logged, workouts, now, onChange }: CalendarDayProps) {
  const [menu, setMenu] = useState<WorkoutItem | null>(null);
  const [completing, setCompleting] = useState<WorkoutItem | null>(null);
  const toast = useUndoToast();

  async function setStatus(item: WorkoutItem, status: WorkoutStatus) {
    toast.close();
    await putWorkout(answerWorkout(item, { status }));
    await onChange();
  }

  async function remove(item: WorkoutItem) {
    const { stored, ...workout } = item;
    if (!stored) return;
    await deleteWorkout(item.id);
    await onChange();
    toast.show(`Tog bort ${item.type}.`, async () => {
      await putWorkout(workout);
      await onChange();
    });
  }

  function actionsFor(item: WorkoutItem): SheetAction[] {
    const actions: SheetAction[] = [];
    if (item.status !== 'genomford') {
      actions.push({
        label: 'Klar',
        onSelect: () => {
          toast.close();
          setCompleting(item);
        },
      });
    }
    if (item.status !== 'hoppad') {
      actions.push({ label: 'Hoppade över', onSelect: () => void setStatus(item, 'hoppad') });
    }
    if (item.status !== 'planerad') {
      actions.push({
        label: 'Markera som planerad',
        onSelect: () => void setStatus(item, 'planerad'),
      });
    }
    if (removable(item)) {
      actions.push({ label: 'Ta bort passet', danger: true, onSelect: () => void remove(item) });
    }
    return actions;
  }

  const empty = logged.length === 0 && workouts.length === 0;

  return (
    <Card title={dayTitle(date)} testId="calendar-day">
      {empty ? (
        <p className="muted">Inget loggat den här dagen.</p>
      ) : (
        <ul className="list" aria-label="Loggat">
          {logged.map(({ marker, value }) => (
            <ListRow
              key={marker.id}
              testId={`calendar-value-${marker.id}`}
              leading={<span className={`calendar-dot dot-${marker.id}`} aria-hidden="true" />}
              primary={marker.label}
              value={<Parts text={value} />}
              wrapValue
            />
          ))}
          {workouts.map((item) => {
            const status = displayStatus(item, now);
            const when = item.time ?? 'Hela dagen';
            return (
              <ListRow
                key={item.id}
                testId="workout"
                className={`workout-row status-${status}`}
                leading={
                  <span
                    className={`calendar-dot dot-traning status-${status}`}
                    aria-hidden="true"
                  />
                }
                primary={describeWorkout(item)}
                secondary={item.note ? `${when} · ${item.note}` : when}
                value={
                  <span className={`workout-badge badge-${status}`}>
                    {DISPLAY_STATUS_LABELS[status]}
                  </span>
                }
                onClick={() => {
                  setMenu(item);
                }}
                swipeLeft={
                  removable(item)
                    ? { label: 'Ta bort', onSwipe: () => void remove(item) }
                    : undefined
                }
              />
            );
          })}
        </ul>
      )}
      {menu && (
        <ActionSheet
          title={menu.type}
          description={`${formatDate(menu.date)} ${menu.time ?? 'Hela dagen'} · ${DISPLAY_STATUS_LABELS[displayStatus(menu, now)]}`}
          actions={actionsFor(menu)}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
      {completing && (
        <CompleteWorkoutSheet
          item={completing}
          onSaved={onChange}
          onClose={() => {
            setCompleting(null);
          }}
        />
      )}
      {toast.toast && (
        <Toast
          message={toast.toast.message}
          onUndo={toast.onUndo}
          onClose={toast.close}
          label="Kalender"
        />
      )}
    </Card>
  );
}
