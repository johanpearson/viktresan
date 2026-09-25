import { useState } from 'react';
import { deleteWorkout, putWorkout } from '../db/db.ts';
import { formatShortDate } from '../lib/format.ts';
import {
  answerWorkout,
  describeWorkout,
  displayStatus,
  DISPLAY_STATUS_LABELS,
  WORKOUT_STATUSES,
  type WorkoutItem,
  type WorkoutStatus,
} from '../lib/workouts.ts';
import { CompleteWorkoutSheet } from './CompleteWorkoutSheet.tsx';

/**
 * - `answer`: planerade pass får Klar / Hoppa över (Översikt → Idag).
 * - `prompt`: som `answer` men "Hoppade över" (Blev passet av?).
 * - `manage`: status kan ändras i efterhand (väljare), Klar som snabbknapp för planerade (Kalender).
 * - `view`: bara visning (Kommande).
 */
export type WorkoutListMode = 'answer' | 'prompt' | 'manage' | 'view';

interface WorkoutListProps {
  items: readonly WorkoutItem[];
  mode: WorkoutListMode;
  now: Date;
  onChange: () => Promise<unknown>;
  /** Visa datum på varje rad (när listan spänner över flera dagar). */
  showDate?: boolean;
  label: string;
}

/** Lista med pass och deras åtgärder. "Klar" öppnar en panel för faktisk längd. */
export function WorkoutList({ items, mode, now, onChange, showDate, label }: WorkoutListProps) {
  const [completing, setCompleting] = useState<WorkoutItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function setStatus(item: WorkoutItem, status: WorkoutStatus) {
    await putWorkout(answerWorkout(item, { status }));
    await onChange();
  }

  async function remove(item: WorkoutItem) {
    if (confirmDelete !== item.id) {
      setConfirmDelete(item.id);
      return;
    }
    await deleteWorkout(item.id);
    setConfirmDelete(null);
    await onChange();
  }

  return (
    <>
      <ul className="workout-list" aria-label={label}>
        {items.map((item) => {
          const status = displayStatus(item, now);
          const when = [showDate ? formatShortDate(item.date) : '', item.time ?? 'Hela dagen']
            .filter(Boolean)
            .join(' ');
          const canAnswer = item.status === 'planerad' && mode !== 'view';
          return (
            <li
              key={item.id}
              className={`workout status-${status}`}
              data-testid="workout"
              data-status={status}
              data-date={item.date}
            >
              <div className="workout-main">
                <span className="workout-when">{when}</span>
                <span className="workout-title">{describeWorkout(item)}</span>
                <span className={`workout-badge badge-${status}`}>
                  {DISPLAY_STATUS_LABELS[status]}
                </span>
              </div>
              {item.note && <p className="entry-extra">{item.note}</p>}
              {canAnswer && (
                <div className="entry-actions">
                  <button
                    type="button"
                    className="button button-small"
                    aria-label={`Klar: ${item.type} ${when}`}
                    onClick={() => {
                      setCompleting(item);
                    }}
                  >
                    Klar
                  </button>
                  {mode !== 'manage' && (
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      aria-label={`${mode === 'prompt' ? 'Hoppade över' : 'Hoppa över'}: ${item.type} ${when}`}
                      onClick={() => void setStatus(item, 'hoppad')}
                    >
                      {mode === 'prompt' ? 'Hoppade över' : 'Hoppa över'}
                    </button>
                  )}
                </div>
              )}
              {mode === 'manage' && (
                <div className="workout-manage">
                  <label className="field workout-status-field">
                    <span className="field-label">Status</span>
                    <select
                      className="input"
                      value={item.status}
                      aria-label={`Status: ${item.type} ${when}`}
                      onChange={(e) => {
                        const next = WORKOUT_STATUSES.find((s) => s.id === e.target.value);
                        if (next) void setStatus(item, next.id);
                      }}
                    >
                      {WORKOUT_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {item.stored && item.planId === undefined && (
                    <button
                      type="button"
                      className="button button-danger button-small"
                      onClick={() => void remove(item)}
                    >
                      {confirmDelete === item.id ? 'Bekräfta' : 'Ta bort'}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {completing && (
        <CompleteWorkoutSheet
          item={completing}
          onSaved={onChange}
          onClose={() => {
            setCompleting(null);
          }}
        />
      )}
    </>
  );
}
