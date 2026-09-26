import { buildDayIndex } from '../lib/calendar.ts';
import { DAY_MARKERS } from '../lib/dayMarkers.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import type { AppData } from '../lib/useAppData.ts';
import { waterGoal, waterOn } from '../lib/water.ts';
import { todaysWorkouts, workoutsBetween } from '../lib/workouts.ts';
import { Feature } from './Feature.tsx';
import { WaterControls } from './WaterControls.tsx';
import { WaterRing } from './WaterRing.tsx';
import { WorkoutList } from './WorkoutList.tsx';

/** Det som visas i "Idag", i ordning: vatten, steg, kcal och pass. */
const TODAY_MARKERS: readonly string[] = ['vatten', 'steg', 'mat', 'traning'];

interface TodayCardProps {
  data: AppData;
  now: Date;
  onChange: () => Promise<unknown>;
}

/** Översikt → Idag: vatten (ring), steg, kcal och dagens pass med Klar / Hoppa över. */
export function TodayCard({ data, now, onChange }: TodayCardProps) {
  const features = useFeatures();
  const today = todayIso(now);
  const day =
    buildDayIndex({
      ...data,
      photoDates: [],
      workouts: workoutsBetween(data.workouts, data.workoutPlans, today, today),
      now,
    }).get(today) ?? {};
  const enabled = features.filter(DAY_MARKERS);
  const markers = TODAY_MARKERS.flatMap((id) => enabled.filter((m) => m.id === id));
  const workouts = todaysWorkouts(data.workouts, data.workoutPlans, now);

  return (
    <section className="card" aria-labelledby="today-title" data-testid="today-card">
      <h2 className="card-title" id="today-title">
        Idag
      </h2>
      <Feature id="vatten">
        <div className="today-water">
          <WaterRing ml={waterOn(data.water, today)} goalMl={waterGoal(data)?.ml ?? null} />
          <WaterControls date={today} water={data.water} onChange={onChange} />
        </div>
      </Feature>
      {markers.length > 0 && (
        <dl className="stats">
          {markers.map((marker) => (
            <div className="stat" key={marker.id} data-testid={`today-${marker.id}`}>
              <dt>{marker.label}</dt>
              <dd>{marker.value(day) ?? '–'}</dd>
            </div>
          ))}
        </dl>
      )}
      <Feature id="traning">
        {workouts.length > 0 && (
          <WorkoutList
            items={workouts}
            mode="answer"
            now={now}
            onChange={onChange}
            label="Dagens pass"
          />
        )}
      </Feature>
    </section>
  );
}
