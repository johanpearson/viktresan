import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { WeightEntry } from '../db/db.ts';

interface WeightChartProps {
  entries: readonly WeightEntry[];
  height?: number;
}

function toSeconds(isoDate: string): number {
  return Date.parse(`${isoDate}T12:00:00`) / 1000;
}

function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** Viktkurva (uPlot). Förväntar sig mätningar sorterade äldst först. */
export function WeightChart({ entries, height = 240 }: WeightChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const data: uPlot.AlignedData = [
      entries.map((e) => toSeconds(e.date)),
      entries.map((e) => e.weightKg),
    ];
    const axisStroke = cssVar(el, '--muted');
    const gridStroke = cssVar(el, '--border');

    const chart = new uPlot(
      {
        width: el.clientWidth,
        height,
        legend: { show: false },
        cursor: { drag: { x: false, y: false } },
        scales: { x: { time: true } },
        axes: [
          { stroke: axisStroke, grid: { stroke: gridStroke } },
          {
            stroke: axisStroke,
            grid: { stroke: gridStroke },
            values: (_u, v) => v.map((n) => `${n} kg`),
          },
        ],
        series: [
          {},
          { label: 'Vikt', stroke: cssVar(el, '--accent'), width: 2, points: { size: 6 } },
        ],
      },
      data,
      el,
    );

    const observer = new ResizeObserver(() => {
      chart.setSize({ width: el.clientWidth, height });
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.destroy();
    };
  }, [entries, height]);

  return <div ref={containerRef} className="chart" role="img" aria-label="Viktkurva" />;
}
