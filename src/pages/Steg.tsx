import { useState } from 'react';
import { EmptyState, Page } from '../components/Page.tsx';
import { RangeFilter } from '../components/RangeFilter.tsx';
import { StepsChart } from '../components/StepsChart.tsx';
import { todayIso } from '../lib/dates.ts';
import { formatInt } from '../lib/format.ts';
import { dailySteps, filterRange, type RangeId } from '../lib/stats.ts';
import { useAppData } from '../lib/useAppData.ts';

export function Steg() {
  const { data } = useAppData();
  const [range, setRange] = useState<RangeId>('1m');

  if (data === null) return <Page title="Steg" />;

  const all = dailySteps(data.measurements);
  if (all.length === 0) {
    return (
      <Page title="Steg">
        <EmptyState>Inga steg loggade ännu. Lägg till steg när du loggar din vikt.</EmptyState>
      </Page>
    );
  }

  const days = filterRange(all, range, todayIso());
  const average = days.length > 0 ? days.reduce((s, d) => s + d.steps, 0) / days.length : null;

  return (
    <Page title="Steg">
      <RangeFilter value={range} onChange={setRange} />
      {days.length === 0 ? (
        <EmptyState>Inga steg i vald period.</EmptyState>
      ) : (
        <div className="card chart-card">
          <StepsChart days={days} />
          {average != null && (
            <p className="muted" data-testid="steps-average">
              Snitt {formatInt(Math.round(average))} steg per loggad dag.
            </p>
          )}
        </div>
      )}
    </Page>
  );
}
