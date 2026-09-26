interface GoalRingProps {
  /** Tillgängligt namn, t.ex. "Kalorier idag". */
  label: string;
  /** Stor text i mitten, t.ex. "1 250". */
  value: string;
  /** Liten text under, t.ex. "av 1 800 kcal". `null` utan mål. */
  goal: string | null;
  /** Andel av målet (0–1+). Ringen fylls högst helt. */
  fraction: number;
  /** Variant för färg: `kcal` eller `protein`. */
  variant: 'kcal' | 'protein';
  /** Läggs till i den upplästa texten när enheten inte står i ringen, t.ex. "kcal". */
  unit?: string;
  testId?: string;
}

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Liten ring som fylls mot ett dagsmål (kalorier, protein). */
export function GoalRing({ label, value, goal, fraction, variant, unit, testId }: GoalRingProps) {
  const spoken = [value, goal, unit].filter((t) => t != null).join(' ');
  const filled = Math.max(0, Math.min(1, fraction));
  return (
    <div
      className={`goal-ring goal-ring-${variant}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(filled * 100)}
      aria-valuetext={spoken}
      data-testid={testId}
    >
      <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true" focusable="false">
        <circle
          className="goal-ring-track"
          cx="48"
          cy="48"
          r={RADIUS}
          strokeWidth="9"
          fill="none"
        />
        <circle
          className="goal-ring-fill"
          cx="48"
          cy="48"
          r={RADIUS}
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${String(CIRCUMFERENCE * filled)} ${String(CIRCUMFERENCE)}`}
          transform="rotate(-90 48 48)"
        />
      </svg>
      <span className="goal-ring-text" aria-hidden="true">
        <span className="goal-ring-value">{value}</span>
        {goal != null && <span className="goal-ring-goal">{goal}</span>}
      </span>
    </div>
  );
}
