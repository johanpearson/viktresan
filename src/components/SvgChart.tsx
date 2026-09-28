import { useId } from 'react';
import { toDayNumber } from '../lib/dates.ts';
import { formatShortDate } from '../lib/format.ts';
import { toneClass, type Tone } from '../lib/tones.ts';

export interface SvgSeries {
  label: string;
  tone: Tone;
  /** `line` = linje, `points` = svaga punkter, `line-points` = linje med punkter, `bars` = staplar. */
  kind: 'line' | 'points' | 'line-points' | 'bars';
  points: readonly { date: string; value: number }[];
}

interface SvgChartProps {
  /** Grafens namn för skärmläsare (t.ex. "Vikt 2 jul.–24 sep."). */
  label: string;
  from: string;
  to: string;
  series: readonly SvgSeries[];
  format: (value: number) => string;
  /** Fast y-axel (t.ex. aptit 1–5); annars från datan med lite luft. */
  yDomain?: readonly [number, number];
  /** Heltalssteg på y-axeln (aptit). */
  integerTicks?: boolean;
  /** Visa förklaringen under grafen (när det finns mer än en serie). */
  legend?: boolean;
  testId?: string;
}

const WIDTH = 360;
const HEIGHT = 180;
const PAD = { top: 8, right: 8, bottom: 22, left: 44 };

/** 3–5 jämna steg (1, 2, 2,5, 5 × 10^n) över intervallet. */
function niceTicks(min: number, max: number, integer: boolean): number[] {
  const span = max - min || 1;
  const raw = span / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(
    integer ? 1 : 0,
    ([1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10) * power,
  );
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1e6; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

/**
 * Statisk graf som SVG: skarp i utskrift och PDF, ingen canvas, inga skript. Datum på
 * x-axeln (hela perioden även om data saknas i början), en serie per datatyp i sin ton.
 * Används i rapporten; interaktiva grafer i appen är uPlot.
 */
export function SvgChart({
  label,
  from,
  to,
  series,
  format,
  yDomain,
  integerTicks = false,
  legend = series.length > 1,
  testId,
}: SvgChartProps) {
  const titleId = useId();
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  if (values.length === 0) return null;
  const hasBars = series.some((s) => s.kind === 'bars');
  let [yMin, yMax] = yDomain ?? [Math.min(...values), Math.max(...values)];
  if (!yDomain) {
    if (hasBars) yMin = 0;
    const pad = (yMax - yMin) * 0.1 || Math.max(1, Math.abs(yMax) * 0.02);
    yMin = hasBars ? 0 : yMin - pad;
    yMax += pad;
  }
  const ticks = niceTicks(yMin, yMax, integerTicks);
  if (!yDomain && ticks.length > 0) {
    yMin = Math.min(yMin, ticks[0] ?? yMin);
    yMax = Math.max(yMax, ticks.at(-1) ?? yMax);
  }

  const x0 = toDayNumber(from);
  const spanDays = Math.max(1, toDayNumber(to) - x0);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const barW = Math.max(1, (plotW / (spanDays + 1)) * 0.7);
  const x = (date: string) =>
    PAD.left +
    (hasBars ? barW / 2 : 0) +
    ((toDayNumber(date) - x0) / spanDays) * (plotW - (hasBars ? barW : 0));
  const y = (value: number) => PAD.top + (1 - (value - yMin) / (yMax - yMin || 1)) * plotH;

  // Datum på x-axeln: början, slutet och upp till två jämnt fördelade däremellan.
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => Math.round(x0 + f * spanDays));
  const uniqueXTicks = [...new Set(xTicks)];

  return (
    <figure className="svg-chart" data-testid={testId}>
      <svg
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        role="img"
        aria-labelledby={titleId}
        className="svg-chart-svg"
      >
        <title id={titleId}>{label}</title>
        {ticks.map((t) => (
          <g key={t} className="svg-chart-grid">
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} />
            <text x={PAD.left - 6} y={y(t)} dy="0.35em" textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {uniqueXTicks.map((day, i) => {
          const date = new Date(day * 86_400_000).toISOString().slice(0, 10);
          const anchor = i === 0 ? 'start' : i === uniqueXTicks.length - 1 ? 'end' : 'middle';
          return (
            <text
              key={day}
              className="svg-chart-axis"
              x={PAD.left + ((day - x0) / spanDays) * plotW}
              y={HEIGHT - 6}
              textAnchor={anchor}
            >
              {formatShortDate(date)}
            </text>
          );
        })}
        {series.map((s) => {
          const tone = toneClass(s.tone);
          if (s.kind === 'bars') {
            return (
              <g key={s.label} className={`svg-chart-bars ${tone}`}>
                {s.points.map((p) => (
                  <rect
                    key={p.date}
                    x={x(p.date) - barW / 2}
                    y={y(p.value)}
                    width={barW}
                    height={Math.max(0, y(yMin) - y(p.value))}
                  />
                ))}
              </g>
            );
          }
          const path = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
            .join(' ');
          return (
            <g key={s.label} className={tone}>
              {s.kind !== 'points' && s.points.length > 1 && (
                <path className="svg-chart-line" d={path} />
              )}
              {s.kind !== 'line' &&
                s.points.map((p) => (
                  <circle
                    key={p.date}
                    className={s.kind === 'points' ? 'svg-chart-point-faint' : 'svg-chart-point'}
                    cx={x(p.date)}
                    cy={y(p.value)}
                    r={s.kind === 'points' ? 2 : 2.5}
                  />
                ))}
            </g>
          );
        })}
      </svg>
      {legend && (
        <figcaption className="bar-legend" aria-hidden="true">
          {series.map((s) => (
            <span key={s.label} className="bar-legend-item">
              <span
                className={`bar-legend-swatch ${s.kind === 'points' ? 'bar-legend-swatch-faint' : ''} ${toneClass(s.tone)}`}
              />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
