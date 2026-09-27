import type { ReactNode } from 'react';

interface ShowMoreProps {
  /** Antal dolda rader; 0 → ingenting renderas. */
  hidden: number;
  onClick: () => void;
  /** Knapptexten, t.ex. "Visa 28 dagar till". */
  children: ReactNode;
}

/** "Visa fler" under en begränsad lista: liten textknapp, aldrig en primärknapp. */
export function ShowMore({ hidden, onClick, children }: ShowMoreProps) {
  if (hidden <= 0) return null;
  return (
    <button type="button" className="button button-ghost button-small show-more" onClick={onClick}>
      {children}
    </button>
  );
}
