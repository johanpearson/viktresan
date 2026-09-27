import type { ReactNode } from 'react';
import { formatInt } from '../lib/format.ts';
import type { Tone } from '../lib/tones.ts';
import { ProgressBar, type BarSegment } from './ProgressBar.tsx';

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
  /** Uppdelad stapel (mat + tillskott) – delarnas andel av målet. */
  segments?: readonly BarSegment[] | undefined;
  /** Rubrik till vänster på värdets rad (t.ex. "Vitamin D" i näringssummeringen). */
  title?: ReactNode | undefined;
  /** Egen text för värdet i stället för heltal (t.ex. "2,5 / 5 µg"). */
  display?: ReactNode | undefined;
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
  segments,
  display,
  title,
}: StatBarProps) {
  return (
    <div className={mini ? 'stat-bar stat-bar-mini' : 'stat-bar'}>
      <p
        className={title == null ? 'stat-bar-value' : 'stat-bar-value stat-bar-titled'}
        data-testid={valueTestId}
      >
        {title != null && <span className="stat-bar-title">{title}</span>}
        <span className="nowrap">
          {display ?? (
            <>
              <strong>{formatInt(value)}</strong>
              {goal == null ? ` ${unit}` : ` / ${formatInt(goal)} ${unit}`}
            </>
          )}
        </span>
      </p>
      {goal != null && (
        <ProgressBar
          thin
          tone={tone}
          fraction={goal > 0 ? value / goal : 0}
          label={label}
          decorative={mini}
          segments={segments}
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
