import { useState, type SyntheticEvent } from 'react';
import { deleteWorkoutPlan, newId, putWorkoutPlan, type WorkoutPlan } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { parsePlanFields } from '../lib/validation.ts';
import {
  describePlan,
  describeWorkout,
  PRESET_WORKOUT_TYPES,
  WEEKDAYS,
  workoutTypes,
} from '../lib/workouts.ts';
import { ActionSheet } from './ActionSheet.tsx';
import { Card } from './Card.tsx';
import { IntensityField } from './IntensityField.tsx';
import { ListRow } from './ListRow.tsx';
import { Toast } from './Toast.tsx';
import { WorkoutTypeField } from './WorkoutTypeField.tsx';

interface WorkoutPlansProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Logga → Träning → Återkommande: scheman som mån/ons/fre 07:00. */
export function WorkoutPlans({ data, onChange }: WorkoutPlansProps) {
  const [type, setType] = useState(PRESET_WORKOUT_TYPES[0] ?? '');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [time, setTime] = useState('07:00');
  const [duration, setDuration] = useState('30');
  const [intensity, setIntensity] = useState('');
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [menu, setMenu] = useState<WorkoutPlan | null>(null);
  const toast = useUndoToast();

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
    const plan: WorkoutPlan = { id: newId(), ...parsed.value, createdAt: Date.now() };
    await putWorkoutPlan(plan);
    await onChange();
    setError(null);
    setWeekdays([]);
    toast.close();
    setStatus(`Schemat är sparat: ${plan.type} ${describePlan(plan)}.`);
  }

  /** Tar bort schemat direkt (svep eller radmenyn) – Ångra lägger tillbaka det. */
  async function remove(plan: WorkoutPlan) {
    await deleteWorkoutPlan(plan.id);
    await onChange();
    setStatus(null);
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
                onClick={() => {
                  setMenu(plan);
                }}
                swipeLeft={{ label: 'Ta bort', onSwipe: () => void remove(plan) }}
              />
            ))}
          </ul>
        )}
      </Card>
      <form className="card form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <h2 className="card-title">Nytt schema</h2>
        <WorkoutTypeField
          value={type}
          onChange={setType}
          types={workoutTypes(data.workouts, data.workoutPlans)}
        />
        <fieldset className="choice-group">
          <legend className="field-label">Veckodagar</legend>
          <div className="weekday-picker">
            {WEEKDAYS.map(([short, long], day) => (
              <button
                key={long}
                type="button"
                className="weekday-button"
                aria-pressed={weekdays.includes(day)}
                aria-label={long}
                onClick={() => {
                  toggleDay(day);
                }}
              >
                {short}
              </button>
            ))}
          </div>
        </fieldset>
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
        <button type="submit" className="button">
          Spara schema
        </button>
        <p className="form-ok" role="status">
          {status}
        </p>
      </form>
      {menu && (
        <ActionSheet
          title={menu.type}
          description={`${describePlan(menu)} · från ${formatDate(menu.startDate)}`}
          actions={[{ label: 'Ta bort schema', danger: true, onSelect: () => void remove(menu) }]}
          onClose={() => {
            setMenu(null);
          }}
        />
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
