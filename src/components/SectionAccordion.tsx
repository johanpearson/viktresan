import type { ReactNode } from 'react';

interface SectionAccordionProps {
  /** Unikt id (för aria-controls). */
  id: string;
  title: string;
  /** Liten text efter rubriken, t.ex. "3 poster". */
  meta?: ReactNode;
  /** Högerställt värde i rubriken, t.ex. "442 kcal". */
  value?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /**
   * Tom sektion: en smal rad med bara rubriken och `actions` (ingen utfällning).
   */
  empty?: boolean;
  /** Knappar till höger om rubriken (⋯, +). Alltid synliga. */
  actions?: ReactNode;
  children?: ReactNode;
  testId?: string;
}

/**
 * Hopfällbar sektion (kort) med rubrik, metatext, värde och chevron. Innehållet
 * renderas bara när sektionen är utfälld och tonar in (150–200 ms, av vid
 * prefers-reduced-motion).
 */
export function SectionAccordion({
  id,
  title,
  meta,
  value,
  expanded,
  onToggle,
  empty = false,
  actions,
  children,
  testId,
}: SectionAccordionProps) {
  const open = expanded && !empty;
  const bodyId = `${id}-body`;
  return (
    <div
      className={empty ? 'accordion accordion-empty' : 'accordion'}
      data-testid={testId}
      data-expanded={open ? 'true' : 'false'}
    >
      <div className="accordion-header">
        {empty ? (
          <h3 className="accordion-heading accordion-heading-empty">{title}</h3>
        ) : (
          <h3 className="accordion-heading">
            <button
              type="button"
              className="accordion-toggle"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={onToggle}
            >
              <span className="accordion-title">{title}</span>
              <span className="accordion-meta">{meta}</span>
              {value != null && <span className="accordion-value">{value}</span>}
              <span aria-hidden="true" className="chevron" />
            </button>
          </h3>
        )}
        {actions}
      </div>
      {open && (
        <div className="accordion-body" id={bodyId}>
          {children}
        </div>
      )}
    </div>
  );
}
