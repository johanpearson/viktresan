import { useState, type SyntheticEvent } from 'react';
import { putWorkout } from '../db/db.ts';
import { formatDate } from '../lib/format.ts';
import { parseDurationField } from '../lib/validation.ts';
import { answerWorkout, INTENSITIES, type Intensity, type WorkoutItem } from '../lib/workouts.ts';
import { BottomSheet } from './BottomSheet.tsx';

interface CompleteWorkoutSheetProps {
  item: WorkoutItem;
  onSaved: () => Promise<unknown>;
  onClose: () => void;
}

/** "Klar": faktisk längd och intensitet, förifyllda från planen. */
export function CompleteWorkoutSheet({ item, onSaved, onClose }: CompleteWorkoutSheetProps) {
  const [duration, setDuration] = useState(String(item.durationMin));
  const [intensity, setIntensity] = useState<Intensity | null>(item.intensity ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const parsed = parseDurationField(duration);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    try {
      await putWorkout(
        answerWorkout(item, { status: 'genomford', durationMin: parsed.value, intensity }),
      );
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet title="Markera som klar" onClose={onClose}>
      <form
        className="card form"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        data-testid="complete-workout"
      >
        <p className="form-note">
          {item.type} · {formatDate(item.date)}
          {item.time ? ` ${item.time}` : ''}
        </p>
        <label className="field">
          <span className="field-label">Faktisk längd (min)</span>
          <input
            className="input"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value);
            }}
          />
        </label>
        <div className="field">
          <span className="field-label" id="complete-intensity">
            Intensitet
          </span>
          <div className="segmented" role="group" aria-labelledby="complete-intensity">
            <button
              type="button"
              className="segmented-button"
              aria-pressed={intensity === null}
              onClick={() => {
                setIntensity(null);
              }}
            >
              Ingen
            </button>
            {INTENSITIES.map((i) => (
              <button
                key={i.id}
                type="button"
                className="segmented-button"
                aria-pressed={intensity === i.id}
                onClick={() => {
                  setIntensity(i.id);
                }}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button" disabled={saving}>
          Spara som genomfört
        </button>
      </form>
    </BottomSheet>
  );
}
