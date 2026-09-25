import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { toChartSeconds } from '../lib/dates.ts';
import { formatInt } from '../lib/format.ts';
import { rollingAverageKcal, type DailyIntake } from '../lib/nutrition.ts';
import { baseAxes, cssVar, dateSeries, observeWidth } from './chartUtils.ts';

interface IntakeChartProps {
  days: readonly DailyIntake[];
  /** Dagens kalorimål som referenslinje, om det finns. */
  targetKcal: number | null;
  height?: number;
}

/** Stapelgraf med intag per dag, kalorimålet som linje och 7-dagarssnitt. */
export function IntakeChart({ days, targetKcal, height = 240 }: IntakeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const averages = rollingAverageKcal(days);
    const data: uPlot.AlignedData = [
      days.map((d) => toChartSeconds(d.date)),
      days.map((d) => Math.round(d.kcal)),
      averages.map((a) => Math.round(a.kcal)),
      days.map(() => targetKcal),
    ];
    const accent = cssVar(el, '--accent');
    const point = cssVar(el, '--chart-point');
    const goal = cssVar(el, '--chart-goal');
    const bars = uPlot.paths.bars?.({ size: [0.7, 40], radius: 0.2 });
    const kcal = (_u: uPlot, v: number | null) => (v == null ? '–' : `${formatInt(v)} kcal`);
    const maxValue = Math.max(targetKcal ?? 0, ...days.map((d) => d.kcal));

    const chart = new uPlot(
      {
        width: el.clientWidth,
        height,
        legend: { show: true, live: true },
        cursor: { drag: { x: false, y: false } },
        scales: {
          x: { time: true, range: (_u, min, max) => [min - 43_200, max + 43_200] },
          y: { range: () => [0, Math.max(1000, Math.ceil((maxValue * 1.1) / 500) * 500)] },
        },
        axes: baseAxes(el, (n) => formatInt(n)),
        series: [
          dateSeries(),
          {
            label: 'Intag',
            stroke: accent,
            fill: accent,
            width: 0,
            points: { show: false },
            ...(bars ? { paths: bars } : {}),
            value: kcal,
          },
          { label: '7-dagarssnitt', stroke: point, width: 2, points: { show: false }, value: kcal },
          {
            label: 'Mål',
            stroke: goal,
            width: 2,
            dash: [6, 6],
            points: { show: false },
            show: targetKcal != null,
            value: kcal,
          },
        ],
      },
      data,
      el,
    );
    const stopObserving = observeWidth(el, chart, height);
    return () => {
      stopObserving();
      chart.destroy();
    };
  }, [days, targetKcal, height]);

  return (
    <div
      ref={containerRef}
      className="chart"
      role="img"
      aria-label="Stapelgraf med intag per dag mot kalorimålet"
      data-bars={days.length}
    />
  );
}
