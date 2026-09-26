import { formatMl } from '../lib/format.ts';

interface WaterRingProps {
  ml: number;
  goalMl: number | null;
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Ring som fylls mot dagens dryckesmål. */
export function WaterRing({ ml, goalMl }: WaterRingProps) {
  const fraction = goalMl ? Math.min(1, ml / goalMl) : 0;
  const text = goalMl ? `${formatMl(ml)} av ${formatMl(goalMl)}` : formatMl(ml);
  return (
    <div
      className="water-ring"
      role="progressbar"
      aria-label="Dryck idag"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuetext={text}
      data-testid="water-ring"
    >
      <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true" focusable="false">
        <circle
          className="water-ring-track"
          cx="60"
          cy="60"
          r={RADIUS}
          strokeWidth="12"
          fill="none"
        />
        <circle
          className="water-ring-fill"
          cx="60"
          cy="60"
          r={RADIUS}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${String(CIRCUMFERENCE * fraction)} ${String(CIRCUMFERENCE)}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className="water-ring-text" aria-hidden="true">
        <span className="water-ring-value">{formatMl(ml)}</span>
        {goalMl != null && <span className="water-ring-goal">av {formatMl(goalMl)}</span>}
      </span>
    </div>
  );
}
