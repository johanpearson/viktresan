import { formatDate, formatInt, formatMl } from '../lib/format.ts';
import { filterRange, type RangeId } from '../lib/stats.ts';
import { dailyWater, type DatedWater } from '../lib/water.ts';
import { ProgressBar } from './ProgressBar.tsx';

interface WaterHistoryProps {
  /** Dryckesposter och drycker ur matloggen (`drinkEntries`). */
  drinks: readonly DatedWater[];
  /** Dagens mål, inklusive ev. träningstillägg. */
  goalOn: (date: string) => number;
  range: RangeId;
  today: string;
}

/** Framsteg → Historik: dryck per dag mot dagens mål. */
export function WaterHistory({ drinks, goalOn, range, today }: WaterHistoryProps) {
  const all = dailyWater(drinks);
  const days = filterRange(all, range, today);
  const reached = days.filter((d) => d.ml >= goalOn(d.date)).length;
  const average = days.length > 0 ? days.reduce((s, d) => s + d.ml, 0) / days.length : null;

  return (
    <section className="card" aria-labelledby="water-history-title" data-testid="water-history">
      <h2 className="card-title" id="water-history-title">
        Dryck
      </h2>
      {all.length === 0 ? (
        <p className="muted">Ingen dryck loggad ännu.</p>
      ) : days.length === 0 ? (
        <p className="muted">Ingen dryck i vald period.</p>
      ) : (
        <>
          <p className="form-note" data-testid="water-summary">
            Snitt {formatMl(average ?? 0)} per loggad dag · målet nått {formatInt(reached)} av{' '}
            {formatInt(days.length)} dagar.
          </p>
          <ul className="water-days">
            {[...days].reverse().map((d) => (
              <li key={d.date} className="water-day" data-testid="water-day">
                <span className="water-day-date">{formatDate(d.date)}</span>
                <span className="water-day-ml">{formatMl(d.ml)}</span>
                <ProgressBar
                  fraction={d.ml / goalOn(d.date)}
                  label={`Dryck ${formatDate(d.date)}`}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
