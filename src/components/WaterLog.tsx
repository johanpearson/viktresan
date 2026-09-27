import { todayIso } from '../lib/dates.ts';
import { formatMl } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { drinkOn, waterGoal } from '../lib/water.ts';
import { Card } from './Card.tsx';
import { DrinkGoalNote } from './DrinkGoalNote.tsx';
import { ListRow } from './ListRow.tsx';
import { WaterControls } from './WaterControls.tsx';
import { WaterRing } from './WaterRing.tsx';

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
  const goal = waterGoal({ profile: data.profile, workouts: data.workouts, date: today });
  const drink = drinkOn(data.water, data.foodLog, today);
  const entries = data.water.filter((w) => w.date === today).reverse();
  return (
    <>
      <div className="card form">
        <WaterRing ml={drink.ml} goalMl={goal.ml} />
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
