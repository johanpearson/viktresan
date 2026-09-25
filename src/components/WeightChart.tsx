import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { toChartSeconds } from '../lib/dates.ts';
import { formatKg } from '../lib/format.ts';
import type { DailyWeight, TrendPoint } from '../lib/stats.ts';
import { baseAxes, cssVar, dateSeries, observeWidth } from './chartUtils.ts';

interface WeightChartProps {
  /** Dagliga värden, äldst först. */
  daily: readonly DailyWeight[];
  /** Trend för samma datum som `daily`. */
  trend: readonly TrendPoint[];
  goalKg?: number | null;
  height?: number;
}

/**
 * Viktgraf (uPlot): dagliga värden som punkter, utjämnad trend som linje och
 * målvikten som streckad linje. Legenden visar värden för dagen under markören.
 */
export function WeightChart({ daily, trend, goalKg = null, height = 260 }: WeightChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const trendByDate = new Map(trend.map((t) => [t.date, t.trendKg]));
    const data: uPlot.AlignedData = [
      daily.map((d) => toChartSeconds(d.date)),
      daily.map((d) => d.weightKg),
      daily.map((d) => trendByDate.get(d.date) ?? null),
      ...(goalKg != null ? [daily.map(() => goalKg)] : []),
    ];
    const accent = cssVar(el, '--accent');
    const pointColor = cssVar(el, '--chart-point');
    const goalColor = cssVar(el, '--chart-goal');
    const surface = cssVar(el, '--surface');
    const fmt = (_u: uPlot, v: number | null) => (v == null ? '–' : formatKg(v));

    const series: uPlot.Series[] = [
      dateSeries(),
      {
        label: 'Daglig vikt',
        stroke: pointColor,
        paths: () => null,
        points: { show: true, size: 8, width: 2, stroke: surface, fill: pointColor },
        value: fmt,
      },
      { label: 'Trend', stroke: accent, width: 2, points: { show: false }, value: fmt },
    ];
    if (goalKg != null) {
      series.push({
        label: 'Mål',
        stroke: goalColor,
        width: 2,
        dash: [6, 6],
        points: { show: false },
        value: fmt,
      });
    }

    const chart = new uPlot(
      {
        width: el.clientWidth,
        height,
        legend: { show: true, live: true },
        cursor: { drag: { x: false, y: false }, points: { size: 10 } },
        scales: { x: { time: true }, y: { range: (_u, min, max) => padRange(min, max) } },
        axes: baseAxes(el, (n) => `${n} kg`),
        series,
      },
      data,
      el,
    );
    const stopObserving = observeWidth(el, chart, height);

    return () => {
      stopObserving();
      chart.destroy();
    };
  }, [daily, trend, goalKg, height]);

  return (
    <div
      ref={containerRef}
      className="chart"
      role="img"
      aria-label="Viktgraf med dagliga värden, trendlinje och målvikt"
      data-points={daily.length}
    />
  );
}

/** Minst ±1 kg luft runt datan så att en enda mätning inte ger en platt skala. */
function padRange(min: number | null, max: number | null): uPlot.Range.MinMax {
  const lo = min ?? 0;
  const hi = max ?? lo;
  const pad = Math.max(1, (hi - lo) * 0.1);
  return [Math.floor(lo - pad), Math.ceil(hi + pad)];
}
