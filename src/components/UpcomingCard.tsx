import type { AppData } from '../lib/useAppData.ts';
import { upcomingWorkouts } from '../lib/workouts.ts';
import { WorkoutList } from './WorkoutList.tsx';

interface UpcomingCardProps {
  data: AppData;
  now: Date;
  onChange: () => Promise<unknown>;
}

/** Översikt → Kommande: de tre närmaste planerade händelserna efter idag. */
export function UpcomingCard({ data, now, onChange }: UpcomingCardProps) {
  const upcoming = upcomingWorkouts(data.workouts, data.workoutPlans, now, 3);
  return (
    <section className="card" aria-labelledby="upcoming-title" data-testid="upcoming-card">
      <h2 className="card-title" id="upcoming-title">
        Kommande
      </h2>
      {upcoming.length === 0 ? (
        <p className="form-note">
          Inget planerat. Planera pass under <a href="#/logga">Logga</a> → Träning.
        </p>
      ) : (
        <WorkoutList
          items={upcoming}
          mode="view"
          now={now}
          onChange={onChange}
          showDate
          label="Kommande pass"
        />
      )}
    </section>
  );
}
