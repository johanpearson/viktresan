import type uPlot from 'uplot';
import { fromDayNumber } from '../lib/dates.ts';
import { formatDate, formatShortDate } from '../lib/format.ts';

export function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/**
 * Tidsaxelns etiketter på svenska ("13 sep.") i stället för uPlots "9/13". Stegen ligger på
 * lokal midnatt; avrundning till närmaste dygn ger rätt datum i alla tidszoner (±12 h).
 */
export function dateAxisValues(splits: readonly number[]): string[] {
  return splits.map((v) => formatShortDate(fromDayNumber(Math.round(v / 86_400))));
}

/** Gemensamma axlar: dämpade linjer och etiketter i textfärg, aldrig seriefärg. */
export function baseAxes(el: Element, formatY: (n: number) => string): uPlot.Axis[] {
  const axisStroke = cssVar(el, '--muted');
  const gridStroke = cssVar(el, '--border');
  return [
    {
      stroke: axisStroke,
      grid: { stroke: gridStroke, width: 1 },
      ticks: { show: false },
      // "13 sep." är bredare än "9/13": minst 64 px per etikett så att de inte krockar.
      space: 64,
      values: (_u, splits) => dateAxisValues(splits),
    },
    {
      stroke: axisStroke,
      grid: { stroke: gridStroke, width: 1 },
      ticks: { show: false },
      size: 56,
      values: (_u, values) => values.map(formatY),
    },
  ];
}

/** Ritar om grafen när behållaren byter bredd. Returnerar städfunktion. */
export function observeWidth(el: HTMLElement, chart: uPlot, height: number): () => void {
  const observer = new ResizeObserver(() => {
    chart.setSize({ width: el.clientWidth, height });
  });
  observer.observe(el);
  return () => {
    observer.disconnect();
  };
}

/** X-serien: datum i legenden på svenska. Tidsstämplarna kommer från `toChartSeconds`. */
export function dateSeries(): uPlot.Series {
  return {
    label: 'Datum',
    value: (_u, v: number | null) =>
      v == null ? '' : formatDate(fromDayNumber(Math.floor(v / 86_400))),
  };
}
