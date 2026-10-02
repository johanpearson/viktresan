import { useRef, type ReactNode } from 'react';
import { useSwipe } from '../lib/useSwipe.ts';

/** En svepåtgärd: texten syns bakom raden medan den sveps. */
export interface SwipeAction {
  label: string;
  onSwipe: () => void;
}

interface ListRowProps {
  /** Huvudtext (namn). Kortas till två rader. */
  primary: ReactNode;
  /** Sekundärtext under, t.ex. mängd eller datum. */
  secondary?: ReactNode;
  /** Högerställt värde (tabellsiffror, bryts aldrig), t.ex. "225 kcal". */
  value?: ReactNode;
  /**
   * Långt värde (t.ex. "Aptit 2 av 5 · Illamående") får brytas mellan delar i stället för att
   * tränga undan texten. Håll ihop delarna med `Parts`.
   */
  wrapValue?: boolean;
  /** Ikon eller prick före texten. */
  leading?: ReactNode;
  /** Tryck på raden (renderas som knapp). */
  onClick?: () => void;
  /** Länk i stället för knapp. */
  href?: string;
  /** Visa › efter värdet (raden öppnar något). */
  chevron?: boolean;
  /** Egen knapp till höger om raden, t.ex. fäll ut. */
  trailing?: ReactNode;
  /** Svep vänster: destruktiv åtgärd (ta bort). Ska följas av en toast med Ångra. */
  swipeLeft?: SwipeAction | undefined;
  /** Svep höger: t.ex. favorit. Raden studsar tillbaka. */
  swipeRight?: SwipeAction | undefined;
  /** Innehåll under raden (t.ex. utfällda ingredienser). Följer med vid svep. */
  children?: ReactNode;
  /** Destruktivt val i en meny (t.ex. "Ta bort"): texten i fel-färg. */
  danger?: boolean;
  /** Förskjutning i y-led (px) medan raden dras i ett dra-handtag, `undefined` = dras inte. */
  dragOffset?: number | undefined;
  className?: string;
  testId?: string;
}

/**
 * Listrad enligt designsystemet: primär/sekundär text till vänster, värde till
 * höger. Tryck = öppna/redigera, svep vänster = ta bort, svep höger = valfri
 * åtgärd. Inga knappar för Redigera/Ta bort i listor.
 */
export function ListRow({
  primary,
  secondary,
  value,
  wrapValue = false,
  leading,
  onClick,
  href,
  chevron = false,
  trailing,
  swipeLeft,
  swipeRight,
  children,
  danger = false,
  dragOffset,
  className,
  testId,
}: ListRowProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const swipe = useSwipe(rowRef, swipeLeft?.onSwipe, swipeRight?.onSwipe);
  const swipeable = swipeLeft !== undefined || swipeRight !== undefined;

  const body = (
    <>
      {leading && <span className="list-row-leading">{leading}</span>}
      <span className="list-row-text">
        <span className="list-row-primary">{primary}</span>
        {secondary != null && <span className="list-row-secondary">{secondary}</span>}
      </span>
      {value != null && (
        <span className={wrapValue ? 'list-row-value list-row-value-wrap' : 'list-row-value'}>
          {value}
        </span>
      )}
      {chevron && <span aria-hidden="true" className="list-row-chevron" />}
    </>
  );

  let main: ReactNode;
  if (href !== undefined) {
    main = (
      <a className="list-row-body" href={href}>
        {body}
      </a>
    );
  } else if (onClick) {
    main = (
      <button
        type="button"
        className="list-row-body"
        onClick={() => {
          if (swipe.consumeSwipe()) return;
          onClick();
        }}
      >
        {body}
      </button>
    );
  } else {
    main = <div className="list-row-body">{body}</div>;
  }

  const { offset } = swipe;
  return (
    <li
      ref={rowRef}
      className={['list-row', danger ? 'list-row-danger' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
      data-swiping={offset < 0 ? 'left' : offset > 0 ? 'right' : undefined}
      data-reordering={dragOffset !== undefined ? 'true' : undefined}
      style={dragOffset ? { transform: `translateY(${String(dragOffset)}px)` } : undefined}
    >
      {swipeLeft && (
        <span className="list-row-action list-row-action-left" aria-hidden="true">
          {swipeLeft.label}
        </span>
      )}
      {swipeRight && (
        <span className="list-row-action list-row-action-right" aria-hidden="true">
          {swipeRight.label}
        </span>
      )}
      <div
        className="list-row-content"
        data-swipeable={swipeable ? 'true' : undefined}
        data-dragging={swipe.dragging ? 'true' : undefined}
        // Förskjutningen sätts via CSSOM (React-style) och omfattas inte av CSP:ns style-src.
        style={offset !== 0 ? { transform: `translateX(${String(offset)}px)` } : undefined}
        {...(swipeable ? swipe.handlers : {})}
      >
        <div className="list-row-main">
          {main}
          {trailing}
        </div>
        {children}
      </div>
    </li>
  );
}
