import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { formatLiters, formatMl } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { drinkOn, waterGoal } from '../lib/water.ts';
import { Card } from './Card.tsx';
import { DrinkGoalNote } from './DrinkGoalNote.tsx';
import { GoalRing } from './GoalRing.tsx';
import { ListRow } from './ListRow.tsx';
import { RingRow } from './RingRow.tsx';
import { WaterControls } from './WaterControls.tsx';

const timeFormat = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' });

interface WaterLogProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/**
 * Logga → Dryck: dagens ring, snabbknappar, valfri mängd, dagens poster och
 * drycker ur matloggen (räknas in automatiskt).
 */
export function WaterLog({ data, onChange }: WaterLogProps) {
  const today = todayIso();
  const glp1 = useFeatures().isEnabled('glp1');
  const goal = waterGoal({ profile: data.profile, workouts: data.workouts, date: today, glp1 });
  const drink = drinkOn(data.water, data.foodLog, today);
  const entries = data.water.filter((w) => w.date === today).reverse();
  return (
    <>
      <div className="card form">
        <RingRow>
          <GoalRing
            size="lg"
            label="Dryck idag"
            value={formatLiters(drink.ml)}
            valueUnit="l"
            goal={`av ${formatLiters(goal.ml)}`}
            valueText={`${formatMl(drink.ml)} av ${formatMl(goal.ml)}`}
            fraction={goal.ml ? drink.ml / goal.ml : 0}
            tone="drink"
            testId="water-ring"
          />
        </RingRow>
        <DrinkGoalNote goal={goal} foodMl={drink.foodMl} />
        <WaterControls date={today} water={data.water} onChange={onChange} custom variant="chips" />
      </div>
      {(entries.length > 0 || drink.food.length > 0) && (
        <Card title="Dagens dryck">
          <ul className="list" aria-label="Dagens dryck">
            {entries.map((e) => (
              <ListRow
                key={e.id}
                testId="water-entry"
                primary={timeFormat.format(e.createdAt)}
                value={formatMl(e.ml)}
              />
            ))}
            {drink.food.map((d) => (
              <ListRow
                key={d.id}
                testId="drink-food-entry"
                primary={d.name}
                secondary="Från Mat – ändras under Mat"
                value={formatMl(d.ml)}
              />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
