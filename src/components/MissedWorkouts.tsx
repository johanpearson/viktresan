import type { AppData } from '../lib/useAppData.ts';
import { findUnanswered } from '../lib/workouts.ts';
import { WorkoutList } from './WorkoutList.tsx';

interface MissedWorkoutsProps {
  data: AppData;
  now: Date;
  onChange: () => Promise<unknown>;
}

/** Överst på Översikt: planerade pass vars tid passerat, tills de är besvarade. */
export function MissedWorkouts({ data, now, onChange }: MissedWorkoutsProps) {
  const missed = findUnanswered(data.workouts, data.workoutPlans, now);
  if (missed.length === 0) return null;
  return (
    <section
      className="card missed-card"
      aria-labelledby="missed-title"
      data-testid="missed-workouts"
    >
      <h2 className="card-title" id="missed-title">
        Blev passet av?
      </h2>
      <WorkoutList
        items={missed}
        mode="prompt"
        now={now}
        onChange={onChange}
        showDate
        label="Obesvarade pass"
      />
    </section>
  );
}
