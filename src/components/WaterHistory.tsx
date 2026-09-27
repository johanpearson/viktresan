import { useMemo } from 'react';
import { formatInt, formatMl } from '../lib/format.ts';
import { filterRange, type RangeId } from '../lib/stats.ts';
import { dailyWater, type DatedWater } from '../lib/water.ts';
import { Card } from './Card.tsx';
import { DailyBarChart } from './DailyBarChart.tsx';

interface WaterHistoryProps {
  /** Dryckesposter och drycker ur matloggen (`drinkEntries`). */
  drinks: readonly DatedWater[];
  /** Dagens mål, inklusive ev. träningstillägg. */
  goalOn: (date: string) => number;
  range: RangeId;
  today: string;
}

/** Framsteg → Historik: dryck per dag som staplar mot dagens mål (streckad linje). */
export function WaterHistory({ drinks, goalOn, range, today }: WaterHistoryProps) {
  const all = useMemo(() => dailyWater(drinks), [drinks]);
  const days = useMemo(() => filterRange(all, range, today), [all, range, today]);
  const values = useMemo(() => days.map((d) => ({ date: d.date, value: d.ml })), [days]);
  const reached = days.filter((d) => d.ml >= goalOn(d.date)).length;
  const average = days.length > 0 ? days.reduce((s, d) => s + d.ml, 0) / days.length : null;

  return (
    <Card title="Dryck" className="chart-card" testId="water-history">
      {all.length === 0 ? (
        <p className="muted">Ingen dryck loggad ännu.</p>
      ) : days.length === 0 ? (
        <p className="muted">Ingen dryck i vald period.</p>
      ) : (
        <>
          <DailyBarChart
            days={values}
            colorVar="--data-drink"
            label="Dryck"
            ariaLabel="Stapelgraf med dryck per dag mot dryckesmålet"
            format={formatMl}
            step={500}
            goalOn={goalOn}
          />
          <p className="muted" data-testid="water-summary">
            <span className="nowrap">Snitt {formatMl(average ?? 0)}</span> per loggad dag ·{' '}
            <span className="nowrap">
              målet nått {formatInt(reached)} av {formatInt(days.length)} dagar
            </span>
            .
          </p>
        </>
      )}
    </Card>
  );
}
