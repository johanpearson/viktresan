import { useState } from 'react';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { formatInt, formatMl } from '../lib/format.ts';
import { dailyIntake, totalOf } from '../lib/nutrition.ts';
import { useOverviewItems } from '../lib/overviewItems.ts';
import { buildPlan } from '../lib/plan.ts';
import { proteinGoalFor } from '../lib/protein.ts';
import type { AppData } from '../lib/useAppData.ts';
import { useFiber } from '../lib/useFiber.ts';
import { drinkOn, waterGoal } from '../lib/water.ts';
import { weekBudget } from '../lib/weekBudget.ts';
import { describeWorkout, workoutsBetween } from '../lib/workouts.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { CalorieDetails } from './CalorieDetails.tsx';
import { DrinkGoalNote } from './DrinkGoalNote.tsx';
import { Feature } from './Feature.tsx';
import { RingAction } from './RingAction.tsx';
import { StatBar } from './StatBar.tsx';
import { WaterControls } from './WaterControls.tsx';
import { WeekBudgetRow } from './WeekBudgetRow.tsx';

interface TodayCardProps {
  data: AppData;
  now: Date;
  onChange: () => Promise<unknown>;
}

type Sheet = 'dryck' | 'kcal';

/**
 * Översikt → Idag: ringarna (dryck, kalorier, protein, fiber – påslagna och inte dolda), veckoraden
 * på en rad och små chips för steg och träning när det finns något idag. Detaljer ligger ett tryck
 * bort: dryck och kalorier öppnar en panel, protein och fiber Mat → Näring.
 */
export function TodayCard({ data, now, onChange }: TodayCardProps) {
  const features = useFeatures();
  const { shows } = useOverviewItems();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const today = todayIso(now);
  const totals = totalOf(data.foodLog.filter((e) => e.date === today));
  const plan = data.profile ? buildPlan(data.profile, data.weights, data.foodLog, today) : null;
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
  const proteinGoalG = proteinGoalFor(data.profile);
  const fiberGoal = foodOn ? fiber.goal : null;
  const fiberToday = fiber.days?.find((d) => d.date === today) ?? null;

  const showDrink = features.isEnabled('vatten') && shows('ring-dryck');
  const showKcal = foodOn && shows('ring-kcal');
  const showProtein = foodOn && shows('ring-protein');
  const showFiber = fiberGoal !== null && shows('ring-fiber');
  const showWeek = foodOn && week !== null && shows('veckorad');
  const ringCount = [showDrink, showKcal, showProtein, showFiber].filter(Boolean).length;
  // Fyra ringar blir mindre så att de ryms på en rad; enheten står då inte i ringen.
  const small = ringCount > 3;

  const steps = features.isEnabled('steg')
    ? (data.steps.find((s) => s.date === today)?.steps ?? 0)
    : 0;
  const done = features.isEnabled('traning')
    ? workoutsBetween(data.workouts, data.workoutPlans, today, today).filter(
        (w) => w.status === 'genomford',
      )
    : [];
  const chips = steps > 0 || done.length > 0;

  if (ringCount === 0 && !showWeek && !chips) return null;
  const k = Math.round(totals.kcal);
  const p = Math.round(totals.proteinG);
  const f = Math.round(fiberToday?.fiberG ?? 0);

  return (
    <section className="card" aria-labelledby="today-title" data-testid="today-card">
      <h2 className="card-title" id="today-title">
        Idag
      </h2>
      {ringCount > 0 && (
        <div className={small ? 'rings rings-4' : 'rings'}>
          {showDrink && (
            <RingAction
              caption="Dryck"
              actionLabel="Dryck – logga dryck"
              onOpen={() => {
                setSheet('dryck');
              }}
              label="Dryck idag"
              value={formatMl(drink.ml)}
              goal={small ? `av ${formatInt(drinkGoal.ml)}` : `av ${formatMl(drinkGoal.ml)}`}
              {...(small ? { unit: 'ml' } : {})}
              fraction={drinkGoal.ml ? drink.ml / drinkGoal.ml : 0}
              tone="drink"
              testId="water-ring"
            />
          )}
          {showKcal && (
            <RingAction
              caption="Kalorier"
              actionLabel="Kalorier – visa kalorimålet"
              onOpen={() => {
                setSheet('kcal');
              }}
              label="Kalorier idag"
              value={formatInt(k)}
              goal={targetKcal == null ? null : `av ${formatInt(targetKcal)}`}
              unit="kcal"
              fraction={targetKcal ? k / targetKcal : 0}
              tone="food"
              testId="kcal-ring"
            />
          )}
          {showProtein && (
            <RingAction
              caption="Protein"
              actionLabel="Protein – visa näring"
              href="#/mat/naring"
              label="Protein idag"
              value={`${formatInt(p)} g`}
              goal={proteinGoalG == null ? null : `av ${formatInt(proteinGoalG)} g`}
              fraction={proteinGoalG ? p / proteinGoalG : 0}
              tone="protein"
              testId="protein-ring"
            />
          )}
          {showFiber && (
            <RingAction
              caption="Fiber"
              actionLabel="Fiber – visa näring"
              href="#/mat/naring"
              label="Fiber idag"
              value={`${formatInt(f)} g`}
              goal={`av ${formatInt(fiberGoal.goalG)} g`}
              fraction={fiberGoal.goalG ? f / fiberGoal.goalG : 0}
              tone="fiber"
              testId="fiber-ring"
            />
          )}
        </div>
      )}
      {chips && (
        <ul className="today-chips" aria-label="Loggat idag">
          {steps > 0 && (
            <li>
              <a className="chip today-chip" href="#/logga/steg" data-testid="today-steg">
                <span className="calendar-dot dot-steg" aria-hidden="true" />
                <span className="num">{formatInt(steps)} steg</span>
              </a>
            </li>
          )}
          {done.length > 0 && (
            <li>
              <a className="chip today-chip" href="#/kalender" data-testid="today-traning">
                <span className="calendar-dot dot-traning" aria-hidden="true" />
                <span className="nowrap">
                  {done.length === 1 && done[0]
                    ? describeWorkout(done[0])
                    : `${String(done.length)} pass klara`}
                </span>
              </a>
            </li>
          )}
        </ul>
      )}
      {showWeek && <WeekBudgetRow week={week} compact />}
      {sheet === 'dryck' && (
        <BottomSheet
          title="Dryck idag"
          onClose={() => {
            setSheet(null);
          }}
        >
          <StatBar
            value={drink.ml}
            goal={drinkGoal.ml}
            unit="ml"
            tone="drink"
            label="Dryckesmålet idag"
            meta={
              drink.ml >= drinkGoal.ml ? 'Målet nått' : `${formatMl(drinkGoal.ml - drink.ml)} kvar`
            }
          />
          <DrinkGoalNote goal={drinkGoal} foodMl={drink.foodMl} />
          <WaterControls
            date={today}
            water={data.water}
            onChange={onChange}
            variant="chips"
            custom
          />
        </BottomSheet>
      )}
      {sheet === 'kcal' && data.profile && plan && (
        <BottomSheet
          title="Kalorimål"
          onClose={() => {
            setSheet(null);
          }}
        >
          <Feature id="mat">
            <CalorieDetails profile={data.profile} result={plan} eatenKcal={totals.kcal} />
          </Feature>
        </BottomSheet>
      )}
    </section>
  );
}
