import { useState } from 'react';
import { deleteWorkout, putWorkout } from '../db/db.ts';
import type { LoggedValue } from '../lib/dayMarkers.ts';
import { formatDate } from '../lib/format.ts';
import { workoutRemovalText } from '../lib/removal.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import {
  answerWorkout,
  describeWorkout,
  displayStatus,
  DISPLAY_STATUS_LABELS,
  intensityLabel,
  type WorkoutItem,
  type WorkoutStatus,
} from '../lib/workouts.ts';
import type { SheetAction } from './ActionSheet.tsx';
import { BottomSheet } from './BottomSheet.tsx';
import { Card } from './Card.tsx';
import { CompleteWorkoutSheet } from './CompleteWorkoutSheet.tsx';
import { DetailSheet } from './DetailSheet.tsx';
import { ListRow } from './ListRow.tsx';
import { Parts } from './Parts.tsx';
import { Toast } from './Toast.tsx';
import { WorkoutForm } from './WorkoutForm.tsx';

interface CalendarDayProps {
  date: string;
  /** Loggade värden (utom träning – passen listas var för sig). */
  logged: readonly LoggedValue[];
  workouts: readonly WorkoutItem[];
  /** Passtyper för formuläret (förval och egna). */
  types: readonly string[];
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
 * en rad per pass. Tryck på ett pass = detaljvyn (Klar, Hoppade över, Redigera, Ta bort med
 * bekräftelse); svep vänster tar bort med Ångra.
 */
export function CalendarDay({ date, logged, workouts, types, now, onChange }: CalendarDayProps) {
  const [menu, setMenu] = useState<WorkoutItem | null>(null);
  const [editing, setEditing] = useState<WorkoutItem | null>(null);
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
    setMenu(null);
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
        <DetailSheet
          title={menu.type}
          testId="workout-detail"
          onClose={() => {
            setMenu(null);
          }}
          onEdit={() => {
            toast.close();
            setEditing(menu);
            setMenu(null);
          }}
          extra={
            <ul className="list action-list" aria-label="Status">
              {actionsFor(menu).map((a) => (
                <ListRow
                  key={a.label}
                  primary={a.label}
                  chevron
                  onClick={() => {
                    setMenu(null);
                    a.onSelect();
                  }}
                />
              ))}
            </ul>
          }
          remove={
            removable(menu)
              ? {
                  label: 'Ta bort passet',
                  title: `Ta bort ${menu.type} ${formatDate(menu.date)}?`,
                  consequence: workoutRemovalText(),
                  onConfirm: () => void remove(menu),
                }
              : undefined
          }
        >
          <ListRow primary="Status" value={DISPLAY_STATUS_LABELS[displayStatus(menu, now)]} />
          <ListRow primary="När" value={`${formatDate(menu.date)} ${menu.time ?? 'Hela dagen'}`} />
          <ListRow primary="Längd" value={`${String(menu.durationMin)} min`} />
          {menu.intensity && (
            <ListRow primary="Intensitet" value={intensityLabel(menu.intensity)} />
          )}
          {menu.note && <ListRow primary="Anteckning" secondary={menu.note} />}
          {menu.planId !== undefined && (
            <ListRow
              primary="Från ett schema"
              secondary="Ta bort schemat under Logga → Träning → Återkommande."
            />
          )}
        </DetailSheet>
      )}
      {editing && (
        <BottomSheet
          title="Redigera pass"
          onClose={() => {
            setEditing(null);
          }}
        >
          <WorkoutForm
            types={types}
            workout={editing}
            onChange={onChange}
            onSaved={(saved) => {
              setEditing(null);
              toast.show(`Sparade ${saved.type} ${formatDate(saved.date)}.`);
            }}
            onCancel={() => {
              setEditing(null);
            }}
          />
        </BottomSheet>
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
