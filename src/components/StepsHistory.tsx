import type { StepsEntry } from '../db/db.ts';
import { formatInt } from '../lib/format.ts';
import { dailySteps, filterRange, type RangeId } from '../lib/stats.ts';
import { StepsChart } from './StepsChart.tsx';

interface StepsHistoryProps {
  steps: readonly StepsEntry[];
  range: RangeId;
  today: string;
}

/** Framsteg → Historik: stapelgraf med steg per dag i vald period. */
export function StepsHistory({ steps, range, today }: StepsHistoryProps) {
  const all = dailySteps(steps);
  const days = filterRange(all, range, today);
  const average = days.length > 0 ? days.reduce((s, d) => s + d.steps, 0) / days.length : null;

  return (
    <section className="card chart-card" aria-labelledby="steps-history-title">
      <h2 className="card-title" id="steps-history-title">
        Steg
      </h2>
      {all.length === 0 ? (
        <p className="muted">Inga steg loggade ännu.</p>
      ) : days.length === 0 ? (
        <p className="muted">Inga steg i vald period.</p>
      ) : (
        <>
          <StepsChart days={days} />
          {average != null && (
            <p className="muted" data-testid="steps-average">
              Snitt {formatInt(Math.round(average))} steg per loggad dag.
            </p>
          )}
        </>
      )}
    </section>
  );
}
