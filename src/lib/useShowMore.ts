import { useState } from 'react';

/** Rader som visas först i en lång lista (Framsteg → Historik). */
export const SHOW_FIRST = 14;
/** Så många rader till för varje tryck på "Visa fler". */
export const SHOW_STEP = 28;

/**
 * Begränsar en lång lista: de `first` första raderna, sedan `step` till per tryck.
 * Returnerar de synliga raderna, hur många som är dolda och `more()`.
 */
export function useShowMore<T>(items: readonly T[], first = SHOW_FIRST, step = SHOW_STEP) {
  const [count, setCount] = useState(first);
  const shown = items.slice(0, count);
  return {
    shown,
    hidden: items.length - shown.length,
    /** Så många som visas vid nästa tryck. */
    next: Math.min(step, items.length - shown.length),
    more: () => {
      setCount((c) => c + step);
    },
  };
}
