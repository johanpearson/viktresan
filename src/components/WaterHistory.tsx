import type { WaterEntry } from '../db/db.ts';
import { formatDate, formatInt, formatMl } from '../lib/format.ts';
import { filterRange, type RangeId } from '../lib/stats.ts';
import { dailyWater } from '../lib/water.ts';
import { ProgressBar } from './ProgressBar.tsx';

interface WaterHistoryProps {
  water: readonly WaterEntry[];
  goalMl: number | null;
  range: RangeId;
  today: string;
}

/** Framsteg → Historik: vatten per dag mot dagens mål. */
export function WaterHistory({ water, goalMl, range, today }: WaterHistoryProps) {
  const all = dailyWater(water);
  const days = filterRange(all, range, today);
  const reached = goalMl == null ? 0 : days.filter((d) => d.ml >= goalMl).length;
  const average = days.length > 0 ? days.reduce((s, d) => s + d.ml, 0) / days.length : null;

  return (
    <section className="card" aria-labelledby="water-history-title" data-testid="water-history">
      <h2 className="card-title" id="water-history-title">
        Vatten
      </h2>
      {all.length === 0 ? (
        <p className="muted">Inget vatten loggat ännu.</p>
      ) : days.length === 0 ? (
        <p className="muted">Inget vatten i vald period.</p>
      ) : (
        <>
          <p className="form-note" data-testid="water-summary">
            Snitt {formatMl(average ?? 0)} per loggad dag
            {goalMl != null &&
              ` · målet (${formatMl(goalMl)}) nått ${formatInt(reached)} av ${formatInt(days.length)} dagar`}
            .
          </p>
          <ul className="water-days">
            {[...days].reverse().map((d) => (
              <li key={d.date} className="water-day" data-testid="water-day">
                <span className="water-day-date">{formatDate(d.date)}</span>
                <span className="water-day-ml">{formatMl(d.ml)}</span>
                {goalMl != null && (
                  <ProgressBar fraction={d.ml / goalMl} label={`Vatten ${formatDate(d.date)}`} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
