import { useState, type SyntheticEvent } from 'react';
import { newId, putWorkout, type Workout } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate } from '../lib/format.ts';
import { parseWorkoutFields } from '../lib/validation.ts';
import {
  hasPassed,
  PRESET_WORKOUT_TYPES,
  WORKOUT_STATUSES,
  type WorkoutItem,
  type WorkoutStatus,
} from '../lib/workouts.ts';
import { IntensityField } from './IntensityField.tsx';
import { WorkoutTypeField } from './WorkoutTypeField.tsx';
import { haptic } from '../lib/haptics.ts';
import { SegmentedControl } from './SegmentedControl.tsx';

interface WorkoutFormProps {
  /** Förval och egna typer (se `workoutTypes`). */
  types: readonly string[];
  onChange: () => Promise<unknown>;
  /** Passet som redigeras (Redigera i kalenderns detaljvy), annars ett nytt. */
  workout?: WorkoutItem | null;
  /** Efter sparad redigering. */
  onSaved?: (workout: Workout) => void;
  onCancel?: () => void;
}

/** Status som föreslås: planerad för framtida pass, annars genomförd. */
function suggestedStatus(date: string, time: string): WorkoutStatus {
  if (time === '') return date > todayIso() ? 'planerad' : 'genomford';
  return hasPassed({ date, time }, new Date()) ? 'genomford' : 'planerad';
}

/** Logga → Träning → Nytt pass, eller ett pass som redigeras (kalenderns detaljvy). */
export function WorkoutForm({
  types,
  onChange,
  workout = null,
  onSaved,
  onCancel,
}: WorkoutFormProps) {
  const [date, setDate] = useState(workout?.date ?? todayIso());
  const [time, setTime] = useState(workout?.time ?? '');
  const [type, setType] = useState(workout?.type ?? PRESET_WORKOUT_TYPES[0] ?? '');
  const [duration, setDuration] = useState(workout ? String(workout.durationMin) : '30');
  const [intensity, setIntensity] = useState<string>(workout?.intensity ?? '');
  const [note, setNote] = useState(workout?.note ?? '');
  // Förslaget följer datum/tid tills användaren väljer status själv.
  const [chosenStatus, setChosenStatus] = useState<WorkoutStatus | null>(workout?.status ?? null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const workoutStatus = chosenStatus ?? suggestedStatus(date, time);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const parsed = parseWorkoutFields({
      date,
      time,
      type,
      duration,
      intensity,
      note,
      status: workoutStatus,
    });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (workout) {
      // Samma id (ett schemapass sparas med `<schema>:<datum>`), schemat följer med.
      const { stored, ...base } = workout;
      const next: Workout = { id: base.id, ...parsed.value, createdAt: base.createdAt };
      if (base.planId !== undefined) next.planId = base.planId;
      if (stored) next.updatedAt = Date.now();
      await putWorkout(next);
      haptic('success');
      await onChange();
      onSaved?.(next);
      return;
    }
    const created: Workout = { id: newId(), ...parsed.value, createdAt: Date.now() };
    await putWorkout(created);
    haptic('success');
    await onChange();
    setError(null);
    setNote('');
    setChosenStatus(null);
    const label = WORKOUT_STATUSES.find((s) => s.id === created.status)?.label ?? '';
    setStatus(`Sparade ${created.type} ${formatDate(created.date)} (${label.toLowerCase()}).`);
  }

  return (
    <form
      className="card form"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
      data-testid="workout-form"
    >
      <h2 className="card-title">{workout ? 'Redigera pass' : 'Nytt pass'}</h2>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Datum</span>
          <input
            className="input"
            type="date"
            value={date}
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
      <WorkoutTypeField value={type} onChange={setType} types={types} />
      <div className="field-row">
        <label className="field">
          <span className="field-label">Längd (min)</span>
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
        <IntensityField value={intensity} onChange={setIntensity} />
      </div>
      <label className="field">
        <span className="field-label">Anteckning (valfri)</span>
        <textarea
          className="input textarea"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </label>
      <SegmentedControl
        label="Status"
        showLabel
        options={WORKOUT_STATUSES}
        value={workoutStatus}
        onChange={setChosenStatus}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {workout ? (
        <div className="button-row">
          <button type="submit" className="button">
            Spara ändringar
          </button>
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Avbryt
          </button>
        </div>
      ) : (
        <button type="submit" className="button">
          Spara pass
        </button>
      )}
      <p className="form-ok" role="status">
        {status}
      </p>
    </form>
  );
}
