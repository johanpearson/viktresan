import { useState, type SyntheticEvent } from 'react';
import { newId, putWorkoutPlan, type WorkoutPlan } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { parsePlanFields } from '../lib/validation.ts';
import { PRESET_WORKOUT_TYPES, WEEKDAYS } from '../lib/workouts.ts';
import { ChipGroup } from './ChipGroup.tsx';
import { IntensityField } from './IntensityField.tsx';
import { WorkoutTypeField } from './WorkoutTypeField.tsx';

interface WorkoutPlanFormProps {
  /** Förval och egna typer (se `workoutTypes`). */
  types: readonly string[];
  /** Schemat som redigeras, annars ett nytt. */
  plan?: WorkoutPlan | null;
  /** Sparat; `status` = kvittens att visa under formuläret (nytt schema). */
  onSaved: (plan: WorkoutPlan) => Promise<string | null>;
  onCancel?: () => void;
}

/** Nytt eller ändrat schema: typ, veckodagar, tid, längd, intensitet och period. */
export function WorkoutPlanForm({ types, plan = null, onSaved, onCancel }: WorkoutPlanFormProps) {
  const [type, setType] = useState(plan?.type ?? PRESET_WORKOUT_TYPES[0] ?? '');
  const [weekdays, setWeekdays] = useState<number[]>(plan ? [...plan.weekdays] : []);
  const [time, setTime] = useState(plan?.time ?? '07:00');
  const [duration, setDuration] = useState(plan ? String(plan.durationMin) : '30');
  const [intensity, setIntensity] = useState<string>(plan?.intensity ?? '');
  const [startDate, setStartDate] = useState(plan?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(plan?.endDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function toggleDay(day: number) {
    setWeekdays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const parsed = parsePlanFields({
      type,
      weekdays,
      time,
      duration,
      intensity,
      startDate,
      endDate,
    });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    // Ett ändrat schema behåller id: redan besvarade pass (`<schema>:<datum>`) hör kvar till det.
    const next: WorkoutPlan = plan
      ? { id: plan.id, ...parsed.value, createdAt: plan.createdAt, updatedAt: Date.now() }
      : { id: newId(), ...parsed.value, createdAt: Date.now() };
    await putWorkoutPlan(next);
    setError(null);
    if (!plan) setWeekdays([]);
    setStatus(await onSaved(next));
  }

  return (
    <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <h2 className="card-title">{plan ? 'Redigera schema' : 'Nytt schema'}</h2>
      <WorkoutTypeField value={type} onChange={setType} types={types} />
      <ChipGroup
        label="Veckodagar"
        columns={7}
        options={WEEKDAYS.map(([short, long], day) => ({
          id: String(day),
          label: short,
          ariaLabel: long,
        }))}
        selected={weekdays.map(String)}
        onToggle={(day) => {
          toggleDay(Number(day));
        }}
      />
      <div className="field-row">
        <label className="field">
          <span className="field-label">Tid</span>
          <input
            className="input"
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
            }}
          />
        </label>
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
      </div>
      <IntensityField value={intensity} onChange={setIntensity} />
      <div className="field-row">
        <label className="field">
          <span className="field-label">Från</span>
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Till (valfri)</span>
          <input
            className="input"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => {
              setEndDate(e.target.value);
            }}
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {plan ? (
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
          Spara schema
        </button>
      )}
      <p className="form-ok" role="status">
        {status}
      </p>
    </form>
  );
}
