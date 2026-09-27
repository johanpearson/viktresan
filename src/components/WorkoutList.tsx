import { useState } from 'react';
import { putWorkout } from '../db/db.ts';
import { formatShortDate } from '../lib/format.ts';
import {
  answerWorkout,
  describeWorkout,
  displayStatus,
  DISPLAY_STATUS_LABELS,
  type WorkoutItem,
  type WorkoutStatus,
} from '../lib/workouts.ts';
import { CompleteWorkoutSheet } from './CompleteWorkoutSheet.tsx';

/**
 * - `answer`: planerade pass får Klar / Hoppa över (Översikt → Idag).
 * - `prompt`: som `answer` men "Hoppade över" (Blev passet av?).
 * - `view`: bara visning (Kommande).
 */
export type WorkoutListMode = 'answer' | 'prompt' | 'view';

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

  async function setStatus(item: WorkoutItem, status: WorkoutStatus) {
    await putWorkout(answerWorkout(item, { status }));
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
                <span className="workout-text">
                  <span className="workout-title">{describeWorkout(item)}</span>
                  <span className="workout-when">{when}</span>
                </span>
                <span className={`workout-badge badge-${status}`}>
                  {DISPLAY_STATUS_LABELS[status]}
                </span>
              </div>
              {item.note && <p className="entry-extra">{item.note}</p>}
              {canAnswer && (
                <div className="entry-actions">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    aria-label={`Klar: ${item.type} ${when}`}
                    onClick={() => {
                      setCompleting(item);
                    }}
                  >
                    Klar
                  </button>
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    aria-label={`${mode === 'prompt' ? 'Hoppade över' : 'Hoppa över'}: ${item.type} ${when}`}
                    onClick={() => void setStatus(item, 'hoppad')}
                  >
                    {mode === 'prompt' ? 'Hoppade över' : 'Hoppa över'}
                  </button>
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
