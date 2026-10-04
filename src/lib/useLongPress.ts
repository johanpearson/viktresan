import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

/** Så länge fingret ska ligga still (ms) för ett långtryck. */
export const LONG_PRESS_MS = 500;
/** Rörelse (px) som avbryter långtrycket (scroll eller svep). */
const SLOP = 8;

export interface LongPress {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  /** Högerklick, menytangenten (Skift+F10) och Androids långtryck öppnar samma meny. */
  onContextMenu: (e: MouseEvent) => void;
  /** `true` om det senaste trycket var ett långtryck – då ignoreras klicket som följer. */
  consumeLongPress: () => boolean;
}

/**
 * Långtryck med pekarhändelser: håll fingret still i 500 ms → `onLongPress`. Webbläsarens
 * egen kontextmeny ersätts med samma åtgärd, så den nås även med mus och tangentbord.
 */
export function useLongPress(onLongPress: (() => void) | undefined): LongPress {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const firedAt = useRef(0);

  function clear() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }

  useEffect(() => clear, []);

  return {
    onPointerDown(e) {
      if (!onLongPress || (e.pointerType === 'mouse' && e.button !== 0)) return;
      clear();
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        firedAt.current = Date.now();
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove(e) {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu(e) {
      if (!onLongPress) return;
      e.preventDefault();
      // Androids långtryck ger både timern och contextmenu – öppna bara en gång.
      if (Date.now() - firedAt.current < 1000) return;
      // Under ett tryck (pekskärm) ska klicket som kan följa ignoreras.
      if (start.current !== null) fired.current = true;
      clear();
      firedAt.current = Date.now();
      onLongPress();
    },
    consumeLongPress() {
      const was = fired.current;
      fired.current = false;
      return was;
    },
  };
}
