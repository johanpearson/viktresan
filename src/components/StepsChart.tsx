import { useMemo } from 'react';
import { formatInt } from '../lib/format.ts';
import type { DailySteps } from '../lib/stats.ts';
import { DailyBarChart } from './DailyBarChart.tsx';

interface StepsChartProps {
  days: readonly DailySteps[];
  height?: number;
}

/** Stapelgraf med steg per dag. */
export function StepsChart({ days, height }: StepsChartProps) {
  const values = useMemo(() => days.map((d) => ({ date: d.date, value: d.steps })), [days]);
  return (
    <DailyBarChart
      days={values}
      colorVar="--data-steps"
      label="Steg"
      ariaLabel="Stapelgraf med steg per dag"
      format={formatInt}
      step={1000}
      {...(height !== undefined ? { height } : {})}
    />
  );
}
