import { buildDayIndex } from '../lib/calendar.ts';
import { DAY_MARKERS } from '../lib/dayMarkers.ts';
import { todayIso } from '../lib/dates.ts';
import { totalOf } from '../lib/nutrition.ts';
import { buildPlan } from '../lib/plan.ts';
import { proteinGoalFor } from '../lib/protein.ts';
import { useFeatures } from '../lib/features.ts';
import type { AppData } from '../lib/useAppData.ts';
import { waterGoal, waterOn } from '../lib/water.ts';
import { todaysWorkouts, workoutsBetween } from '../lib/workouts.ts';
import { Feature } from './Feature.tsx';
import { NutritionRings } from './NutritionRings.tsx';
import { WaterControls } from './WaterControls.tsx';
import { WaterRing } from './WaterRing.tsx';
import { WorkoutList } from './WorkoutList.tsx';

/** Värden i "Idag", i ordning (kalorier och protein visas som ringar). */
const TODAY_MARKERS: readonly string[] = ['vatten', 'steg', 'traning'];

interface TodayCardProps {
  data: AppData;
  now: Date;
  onChange: () => Promise<unknown>;
}

/** Översikt → Idag: vatten (ring), kalorier och protein (ringar), steg och dagens pass. */
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
  const totals = totalOf(data.foodLog.filter((e) => e.date === today));
  const plan = data.profile ? buildPlan(data.profile, data.weights, data.foodLog, today) : null;

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
      <Feature id="mat">
        <NutritionRings
          kcal={totals.kcal}
          targetKcal={plan?.kind === 'plan' ? plan.plan.targetKcal : null}
          proteinG={totals.proteinG}
          proteinGoalG={proteinGoalFor(data.profile)}
        />
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
