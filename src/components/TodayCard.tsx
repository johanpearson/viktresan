import { buildDayIndex } from '../lib/calendar.ts';
import { DAY_MARKERS } from '../lib/dayMarkers.ts';
import { todayIso } from '../lib/dates.ts';
import { dailyIntake, totalOf } from '../lib/nutrition.ts';
import { buildPlan } from '../lib/plan.ts';
import { proteinGoalFor } from '../lib/protein.ts';
import { useFeatures } from '../lib/features.ts';
import type { AppData } from '../lib/useAppData.ts';
import { formatInt, formatMl } from '../lib/format.ts';
import { useFiber } from '../lib/useFiber.ts';
import { drinkOn, waterGoal } from '../lib/water.ts';
import { weekBudget } from '../lib/weekBudget.ts';
import { todaysWorkouts, workoutsBetween } from '../lib/workouts.ts';
import { DrinkGoalNote } from './DrinkGoalNote.tsx';
import { Feature } from './Feature.tsx';
import { FiberNote } from './FiberNote.tsx';
import { GoalRing } from './GoalRing.tsx';
import { NutritionRings } from './NutritionRings.tsx';
import { WaterControls } from './WaterControls.tsx';
import { WeekBudgetRow } from './WeekBudgetRow.tsx';
import { WorkoutList } from './WorkoutList.tsx';

/** Värden i "Idag", i ordning (kalorier och protein visas som ringar). */
const TODAY_MARKERS: readonly string[] = ['vatten', 'steg', 'traning'];

interface TodayCardProps {
  data: AppData;
  now: Date;
  onChange: () => Promise<unknown>;
}

/** Översikt → Idag: dryck, kalorier, protein (och fiber) som ringar, snabbval för dryck, steg och dagens pass. */
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
  // Ringen visar dagsmålet; veckoraden under ringarna visar veckan (7 × dagsmålet).
  const targetKcal = plan?.kind === 'plan' ? plan.plan.targetKcal : null;
  const week =
    plan?.kind === 'plan'
      ? weekBudget({
          dailyTargetKcal: plan.plan.targetKcal,
          floorKcal: plan.plan.floorKcal,
          intake: dailyIntake(data.foodLog),
          today,
        })
      : null;
  const drinkGoal = waterGoal({
    profile: data.profile,
    workouts: data.workouts,
    date: today,
    glp1: features.isEnabled('glp1'),
  });
  const drink = drinkOn(data.water, data.foodLog, today);
  const fiber = useFiber(data.profile, data.foodLog, today);
  const foodOn = features.isEnabled('mat');
  const fiberGoal = foodOn ? fiber.goal : null;
  const fiberToday = fiber.days?.find((d) => d.date === today) ?? null;
  // Fyra ringar (dryck, kalorier, protein, fiber) blir mindre så att de ryms på en rad.
  const ringCount = (features.isEnabled('vatten') ? 1 : 0) + (foodOn ? 2 : 0) + (fiberGoal ? 1 : 0);

  return (
    <section className="card" aria-labelledby="today-title" data-testid="today-card">
      <h2 className="card-title" id="today-title">
        Idag
      </h2>
      <div className={ringCount > 3 ? 'rings rings-4' : 'rings'}>
        <Feature id="vatten">
          <figure className="ring-figure">
            <GoalRing
              label="Dryck idag"
              value={formatMl(drink.ml)}
              // Fyra ringar: enheten står redan i värdet (läses upp via `unit`).
              goal={
                ringCount > 3 ? `av ${formatInt(drinkGoal.ml)}` : `av ${formatMl(drinkGoal.ml)}`
              }
              {...(ringCount > 3 ? { unit: 'ml' } : {})}
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
            fiber={fiberGoal ? { fiberG: fiberToday?.fiberG ?? 0, goalG: fiberGoal.goalG } : null}
          />
        </Feature>
      </div>
      {fiberGoal && <FiberNote goal={fiberGoal} day={fiberToday} />}
      <Feature id="mat">{week && <WeekBudgetRow week={week} />}</Feature>
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
