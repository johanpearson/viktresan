import { useState, type SyntheticEvent } from 'react';
import { newId, putWorkout, type Workout } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { parseWorkoutFields } from '../lib/validation.ts';
import {
  hasPassed,
  PRESET_WORKOUT_TYPES,
  WORKOUT_STATUSES,
  workoutTypes,
  type WorkoutStatus,
} from '../lib/workouts.ts';
import { IntensityField } from './IntensityField.tsx';
import { WorkoutTypeField } from './WorkoutTypeField.tsx';

interface WorkoutFormProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Status som föreslås: planerad för framtida pass, annars genomförd. */
function suggestedStatus(date: string, time: string): WorkoutStatus {
  if (time === '') return date > todayIso() ? 'planerad' : 'genomford';
  return hasPassed({ date, time }, new Date()) ? 'genomford' : 'planerad';
}

/** Logga → Träning → Nytt pass. */
export function WorkoutForm({ data, onChange }: WorkoutFormProps) {
  const [date, setDate] = useState(todayIso);
  const [time, setTime] = useState('');
  const [type, setType] = useState(PRESET_WORKOUT_TYPES[0] ?? '');
  const [duration, setDuration] = useState('30');
  const [intensity, setIntensity] = useState('');
  const [note, setNote] = useState('');
  // Förslaget följer datum/tid tills användaren väljer status själv.
  const [chosenStatus, setChosenStatus] = useState<WorkoutStatus | null>(null);
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
    const workout: Workout = { id: newId(), ...parsed.value, createdAt: Date.now() };
    await putWorkout(workout);
    await onChange();
    setError(null);
    setNote('');
    setChosenStatus(null);
    const label = WORKOUT_STATUSES.find((s) => s.id === workout.status)?.label ?? '';
    setStatus(`Sparade ${workout.type} ${formatDate(workout.date)} (${label.toLowerCase()}).`);
  }

  return (
    <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <h2 className="card-title">Nytt pass</h2>
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
      <WorkoutTypeField
        value={type}
        onChange={setType}
        types={workoutTypes(data.workouts, data.workoutPlans)}
      />
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
      <fieldset className="choice-group">
        <legend className="field-label">Status</legend>
        <div className="segmented">
          {WORKOUT_STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="segmented-button"
              aria-pressed={workoutStatus === s.id}
              onClick={() => {
                setChosenStatus(s.id);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button">
        Spara pass
      </button>
      <p className="form-ok" role="status">
        {status}
      </p>
    </form>
  );
}
