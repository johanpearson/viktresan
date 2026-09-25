import { todayIso } from '../lib/dates.ts';
import { formatMl } from '../lib/format.ts';
import type { AppData } from '../lib/useAppData.ts';
import { waterGoal, waterOn } from '../lib/water.ts';
import { WaterControls } from './WaterControls.tsx';
import { WaterRing } from './WaterRing.tsx';

const timeFormat = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' });

interface WaterLogProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Logga → Vatten: dagens ring, snabbknappar, valfri mängd och dagens poster. */
export function WaterLog({ data, onChange }: WaterLogProps) {
  const today = todayIso();
  const goal = waterGoal(data);
  const entries = data.water.filter((w) => w.date === today).reverse();
  return (
    <div className="card form">
      <h2 className="card-title">Vatten idag</h2>
      <WaterRing ml={waterOn(data.water, today)} goalMl={goal?.ml ?? null} />
      <WaterControls date={today} water={data.water} onChange={onChange} custom />
      {entries.length > 0 && (
        <ul className="entry-list" aria-label="Dagens vatten">
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
    </div>
  );
}
