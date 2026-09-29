import { RING_RADIUS, RING_STROKE, RING_VIEWBOX } from '../lib/ringFit.ts';
import { toneClass, type Tone } from '../lib/tones.ts';

interface GoalRingProps {
  /** Tillgängligt namn, t.ex. "Kalorier idag". */
  label: string;
  /** Siffran i mitten, t.ex. "1 250" eller "1,8". */
  value: string;
  /** Enhet efter siffran i mindre stil, t.ex. "g" eller "l". */
  valueUnit?: string;
  /** Liten text under, t.ex. "av 1 800". `null` utan mål. */
  goal: string | null;
  /** Andel av målet (0–1+). Ringen fylls högst helt. */
  fraction: number;
  /** Datatypens färg, t.ex. `food` (kalorier), `protein` eller `drink`. */
  tone: Tone;
  /** Läggs till i den upplästa texten när enheten inte står i ringen, t.ex. "kcal". */
  unit?: string;
  /** Uppläst text i stället för den synliga, t.ex. exakta ml när ringen visar liter. */
  valueText?: string;
  /** `lg` = 120 px (ensam ring i en panel), annars 96 px. */
  size?: 'md' | 'lg';
  testId?: string;
}

const CENTER = RING_VIEWBOX / 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Ring (designsystemets Ring) som fylls mot ett dagsmål: kalorier, protein, fiber, dryck. Läggs i en
 * `RingRow`, som krymper texten så att den ryms inom ringens inre cirkel.
 */
export function GoalRing({
  label,
  value,
  valueUnit,
  goal,
  fraction,
  tone,
  unit,
  valueText,
  size = 'md',
  testId,
}: GoalRingProps) {
  const spoken =
    valueText ??
    [valueUnit ? `${value} ${valueUnit}` : value, goal, unit].filter((t) => t != null).join(' ');
  const filled = Math.max(0, Math.min(1, fraction));
  const px = size === 'lg' ? 120 : 96;
  return (
    <div
      className={`goal-ring goal-ring-${size} ${toneClass(tone)}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(filled * 100)}
      aria-valuetext={spoken}
      data-testid={testId}
    >
      <svg
        viewBox={`0 0 ${String(RING_VIEWBOX)} ${String(RING_VIEWBOX)}`}
        width={px}
        height={px}
        aria-hidden="true"
        focusable="false"
      >
        <circle
          className="goal-ring-track"
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <circle
          className="goal-ring-fill"
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${String(CIRCUMFERENCE * filled)} ${String(CIRCUMFERENCE)}`}
          transform={`rotate(-90 ${String(CENTER)} ${String(CENTER)})`}
        />
      </svg>
      <span className="goal-ring-text" aria-hidden="true">
        <span className="goal-ring-line goal-ring-value">
          {value}
          {valueUnit && <span className="goal-ring-unit">{valueUnit}</span>}
        </span>
        {goal != null && <span className="goal-ring-line goal-ring-goal">{goal}</span>}
      </span>
    </div>
  );
}
