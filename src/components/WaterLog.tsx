import { todayIso } from '../lib/dates.ts';
import { formatMl } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { drinkOn, waterGoal } from '../lib/water.ts';
import { DrinkGoalNote } from './DrinkGoalNote.tsx';
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
    <div className="card form">
      <h2 className="card-title">Dryck idag</h2>
      <WaterRing ml={drink.ml} goalMl={goal.ml} />
      <DrinkGoalNote goal={goal} foodMl={drink.foodMl} />
      <WaterControls date={today} water={data.water} onChange={onChange} custom />
      {entries.length > 0 && (
        <ul className="entry-list" aria-label="Dagens dryck">
          {entries.map((e) => (
            <li key={e.id} className="entry entry-compact" data-testid="water-entry">
              <span className="entry-main">
                <span>{timeFormat.format(e.createdAt)}</span>
                <span className="entry-weight">{formatMl(e.ml)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {drink.food.length > 0 && (
        <>
          <h3 className="subheading">Från Mat</h3>
          <ul className="entry-list" aria-label="Dryck från Mat">
            {drink.food.map((d) => (
              <li key={d.id} className="entry entry-compact" data-testid="drink-food-entry">
                <span className="entry-main">
                  <span>{d.name}</span>
                  <span className="entry-weight">{formatMl(d.ml)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="form-note">Ändra eller ta bort dem under Mat.</p>
        </>
      )}
    </div>
  );
}
