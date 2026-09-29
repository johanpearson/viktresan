import type { ReactNode } from 'react';

interface SectionAccordionProps {
  /** Unikt id (för aria-controls). */
  id: string;
  title: string;
  /** Liten text efter rubriken, t.ex. "3 poster". */
  meta?: ReactNode;
  /** Högerställt värde i rubriken, t.ex. "442 kcal" – i en fast kolumn, samma i alla sektioner. */
  value?: ReactNode;
  /** Rad under rubriken (dämpad), indragen i linje med namnet, t.ex. makron och fiber. Visas inte för en tom sektion. */
  detail?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /**
   * Tom sektion: en smal rad med bara rubriken och `actions` (ingen utfällning).
   */
  empty?: boolean;
  /** Knappar till höger om värdet (⋯, +). Alltid synliga, ligger utanför tryckytan för utfällning. */
  actions?: ReactNode;
  children?: ReactNode;
  testId?: string;
}

/**
 * Hopfällbar sektion (kort). Rubrikraden är ett fast rutnät:
 * [pil] [namn + metatext, kortas med …] [värde, fast minbredd] [⋯] [+] – inget bryts till en
 * ny rad, och pilen och värdet står i samma kolumn i alla sektioner. Hela rubriken utom
 * åtgärderna är tryckytan (knappen täcker raden, åtgärderna ligger ovanpå). Innehållet
 * renderas bara när sektionen är utfälld och glider in (200 ms, av vid prefers-reduced-motion).
 */
export function SectionAccordion({
  id,
  title,
  meta,
  value,
  detail,
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
          <h3 className="accordion-heading accordion-heading-empty">
            <span className="accordion-name">{title}</span>
          </h3>
        ) : (
          <h3 className="accordion-heading">
            <button
              type="button"
              className="accordion-toggle"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={onToggle}
            >
              <span aria-hidden="true" className="accordion-chevron" />
              <span className="accordion-name">
                <span className="accordion-title">{title}</span>
                {meta != null && <span className="accordion-meta"> {meta}</span>}
              </span>
              <span className="accordion-value">{value}</span>
              {detail != null && <span className="accordion-detail">{detail}</span>}
            </button>
          </h3>
        )}
        {actions != null && <div className="accordion-actions">{actions}</div>}
      </div>
      {open && (
        <div className="accordion-body" id={bodyId}>
          {children}
        </div>
      )}
    </div>
  );
}
