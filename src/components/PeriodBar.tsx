import type { ReactNode } from 'react';

interface PeriodBarProps {
  /** Rubriken i mitten, t.ex. "September 2026" (h2, läses upp vid byte). */
  title: ReactNode;
  titleId?: string;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * ‹ Period › – som `DateBar` men för en månad eller vecka: ramlösa pilar och en rubrik.
 * Används överst i ett kort (Kalender).
 */
export function PeriodBar({
  title,
  titleId,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
}: PeriodBarProps) {
  return (
    <div className="date-bar period-bar">
      <button type="button" className="date-bar-step" aria-label={prevLabel} onClick={onPrev}>
        <span aria-hidden="true">‹</span>
      </button>
      <h2 className="period-bar-title" id={titleId} aria-live="polite">
        {title}
      </h2>
      <button type="button" className="date-bar-step" aria-label={nextLabel} onClick={onNext}>
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
