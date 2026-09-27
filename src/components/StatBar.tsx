import type { ReactNode } from 'react';
import { formatInt } from '../lib/format.ts';
import type { Tone } from '../lib/tones.ts';
import { ProgressBar } from './ProgressBar.tsx';

interface StatBarProps {
  /** Uppnått värde, t.ex. 827. */
  value: number;
  /** Mål, `null` om det saknas (då visas ingen stapel). */
  goal: number | null;
  /** Enhet efter målet, t.ex. "kcal" eller "g protein". */
  unit: string;
  tone: Tone;
  /** Stapelns namn för skärmläsare, t.ex. "Kalorier idag". */
  label: string;
  /** Uppläst värde, t.ex. "827 av 1 680 kcal". */
  valueText?: string | undefined;
  /** Rad under stapeln, t.ex. "853 kcal kvar". */
  meta?: ReactNode | undefined;
  /** `mini`: mindre siffra, ingen metarad, stapeln bara visuell. */
  mini?: boolean;
  valueTestId?: string | undefined;
  metaTestId?: string | undefined;
}

/** Nyckeltal mot ett mål: "827 / 1 680 kcal", tunn stapel i datatypens färg och en metarad. */
export function StatBar({
  value,
  goal,
  unit,
  tone,
  label,
  valueText,
  meta,
  mini = false,
  valueTestId,
  metaTestId,
}: StatBarProps) {
  return (
    <div className={mini ? 'stat-bar stat-bar-mini' : 'stat-bar'}>
      <p className="stat-bar-value" data-testid={valueTestId}>
        <strong>{formatInt(value)}</strong>
        {goal == null ? ` ${unit}` : ` / ${formatInt(goal)} ${unit}`}
      </p>
      {goal != null && (
        <ProgressBar
          thin
          tone={tone}
          fraction={goal > 0 ? value / goal : 0}
          label={label}
          decorative={mini}
          {...(valueText ? { valueText } : {})}
        />
      )}
      {!mini && meta != null && (
        <p className="stat-bar-meta" data-testid={metaTestId}>
          {meta}
        </p>
      )}
    </div>
  );
}
