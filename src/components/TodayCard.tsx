import { buildDayIndex } from '../lib/calendar.ts';
import { DAY_MARKERS } from '../lib/dayMarkers.ts';
import { todayIso } from '../lib/dates.ts';
import { dailyIntake, totalOf } from '../lib/nutrition.ts';
import { buildPlan } from '../lib/plan.ts';
import { proteinGoalFor } from '../lib/protein.ts';
import { useFeatures } from '../lib/features.ts';
import type { AppData } from '../lib/useAppData.ts';
import { formatMl } from '../lib/format.ts';
import { drinkOn, waterGoal } from '../lib/water.ts';
import { dayTarget } from '../lib/weekBudget.ts';
import { todaysWorkouts, workoutsBetween } from '../lib/workouts.ts';
import { DrinkGoalNote } from './DrinkGoalNote.tsx';
import { Feature } from './Feature.tsx';
import { GoalRing } from './GoalRing.tsx';
import { NutritionRings } from './NutritionRings.tsx';
import { WaterControls } from './WaterControls.tsx';
import { WeekBudgetStatus } from './WeekBudgetStatus.tsx';
import { WorkoutList } from './WorkoutList.tsx';

/** Värden i "Idag", i ordning (kalorier och protein visas som ringar). */
const TODAY_MARKERS: readonly string[] = ['vatten', 'steg', 'traning'];

interface TodayCardProps {
  data: AppData;
  now: Date;
  onChange: () => Promise<unknown>;
}

/** Översikt → Idag: dryck, kalorier och protein som tre ringar, snabbval för dryck, steg och dagens pass. */
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
  // Veckoläge: ringen visar dagens förslag och veckans status visas under ringarna.
  const { targetKcal, week } = dayTarget(
    data.profile?.calorieMode,
    plan?.kind === 'plan' ? plan.plan : null,
    dailyIntake(data.foodLog),
    today,
  );
  const drinkGoal = waterGoal({ profile: data.profile, workouts: data.workouts, date: today });
  const drink = drinkOn(data.water, data.foodLog, today);

  return (
    <section className="card" aria-labelledby="today-title" data-testid="today-card">
      <h2 className="card-title" id="today-title">
        Idag
      </h2>
      <div className="rings">
        <Feature id="vatten">
          <figure className="ring-figure">
            <GoalRing
              label="Dryck idag"
              value={formatMl(drink.ml)}
              goal={`av ${formatMl(drinkGoal.ml)}`}
              fraction={drinkGoal.ml ? drink.ml / drinkGoal.ml : 0}
              tone="drink"
              testId="water-ring"
            />
            <figcaption>Dryck</figcaption>
          </figure>
        </Feature>
        <Feature id="mat">
          <NutritionRings
            kcal={totals.kcal}
            targetKcal={targetKcal}
            proteinG={totals.proteinG}
            proteinGoalG={proteinGoalFor(data.profile)}
          />
        </Feature>
      </div>
      <Feature id="mat">{week && <WeekBudgetStatus week={week} />}</Feature>
      <Feature id="vatten">
        <WaterControls date={today} water={data.water} onChange={onChange} variant="chips" />
        <DrinkGoalNote goal={drinkGoal} foodMl={drink.foodMl} />
      </Feature>
      {markers.length > 0 && (
        <dl className="stats stats-compact">
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
