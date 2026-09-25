import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { toChartSeconds } from '../lib/dates.ts';
import { formatInt } from '../lib/format.ts';
import type { DailySteps } from '../lib/stats.ts';
import { baseAxes, cssVar, dateSeries, observeWidth } from './chartUtils.ts';

interface StepsChartProps {
  days: readonly DailySteps[];
  height?: number;
}

/** Stapelgraf med steg per dag. */
export function StepsChart({ days, height = 240 }: StepsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const data: uPlot.AlignedData = [
      days.map((d) => toChartSeconds(d.date)),
      days.map((d) => d.steps),
    ];
    const accent = cssVar(el, '--accent');
    const bars = uPlot.paths.bars?.({ size: [0.7, 40], radius: 0.2 });

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
          y: {
            range: (_u, _min, max) => [0, Math.max(1000, Math.ceil((max * 1.1) / 1000) * 1000)],
          },
        },
        axes: baseAxes(el, (n) => formatInt(n)),
        series: [
          dateSeries(),
          {
            label: 'Steg',
            stroke: accent,
            fill: accent,
            width: 0,
            points: { show: false },
            ...(bars ? { paths: bars } : {}),
            value: (_u, v: number | null) => (v == null ? '–' : formatInt(v)),
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
  }, [days, height]);

  return (
    <div
      ref={containerRef}
      className="chart"
      role="img"
      aria-label="Stapelgraf med steg per dag"
      data-bars={days.length}
    />
  );
}
