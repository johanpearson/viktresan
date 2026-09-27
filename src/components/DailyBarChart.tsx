import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { toChartSeconds } from '../lib/dates.ts';
import { baseAxes, cssVar, dateSeries, observeWidth } from './chartUtils.ts';

/** Ett värde per dag, äldst först. */
export interface DailyValue {
  date: string;
  value: number;
}

interface DailyBarChartProps {
  days: readonly DailyValue[];
  /** Datatypens färg, t.ex. `--data-steps`. */
  colorVar: `--data-${string}`;
  /** Seriens namn i legenden ("Steg", "Dryck"). */
  label: string;
  /** Tillgängligt namn för grafen (role="img"). */
  ariaLabel: string;
  /** Värde i legenden och på y-axeln. */
  format: (value: number) => string;
  /** Avrundning av y-axelns tak (1 000 steg, 500 ml). */
  step: number;
  /** Valfritt mål per dag: streckad linje. */
  goalOn?: ((date: string) => number) | undefined;
  height?: number;
}

/** Stapelgraf med ett värde per dag i datatypens färg, med valfri mållinje (steg, dryck). */
export function DailyBarChart({
  days,
  colorVar,
  label,
  ariaLabel,
  format,
  step,
  goalOn,
  height = 240,
}: DailyBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const goals = goalOn ? days.map((d) => goalOn(d.date)) : null;
    const data: uPlot.AlignedData = [
      days.map((d) => toChartSeconds(d.date)),
      days.map((d) => d.value),
      ...(goals ? [goals] : []),
    ];
    const accent = cssVar(el, colorVar);
    const goalColor = cssVar(el, '--chart-goal');
    const bars = uPlot.paths.bars?.({ size: [0.7, 40], radius: 0.2 });
    const fmt = (_u: uPlot, v: number | null) => (v == null ? '–' : format(v));
    const maxValue = Math.max(...days.map((d) => d.value), ...(goals ?? []));

    const series: uPlot.Series[] = [
      dateSeries(),
      {
        label,
        stroke: accent,
        fill: accent,
        width: 0,
        points: { show: false },
        ...(bars ? { paths: bars } : {}),
        value: fmt,
      },
    ];
    if (goals) {
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
        cursor: { drag: { x: false, y: false } },
        scales: {
          x: {
            time: true,
            // En halv dag luft på varje sida så att första och sista stapeln syns hela.
            range: (_u, min, max) => [min - 43_200, max + 43_200],
          },
          y: { range: () => [0, Math.max(step, Math.ceil((maxValue * 1.1) / step) * step)] },
        },
        axes: baseAxes(el, format),
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
  }, [days, colorVar, label, format, step, goalOn, height]);

  return (
    <div
      ref={containerRef}
      className="chart"
      role="img"
      aria-label={ariaLabel}
      data-bars={days.length}
    />
  );
}
