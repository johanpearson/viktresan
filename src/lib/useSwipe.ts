import { useRef, useState, type PointerEvent, type RefObject } from 'react';

/** Pixlar innan en rörelse räknas som svep eller scroll. */
const SLOP = 8;
/** Andel av radens bredd som ett svep måste nå för att räknas. */
const TRIGGER_FRACTION = 0.35;
/** Längsta förskjutning åt höger – raden glider inte ut, den studsar tillbaka. */
const MAX_RIGHT = 160;

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  /** `null` tills rörelsen avgjorts: vågrätt (svep) eller lodrätt (scroll). */
  horizontal: boolean | null;
}

export interface SwipeHandlers {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
}

export interface Swipe {
  /** Aktuell förskjutning i px (negativ = vänster). */
  offset: number;
  /** Fingret är nere och raden följer det (ingen övergång). */
  dragging: boolean;
  handlers: SwipeHandlers;
  /**
   * `true` om det senaste trycket var ett svep – då ska klicket som följer
   * ignoreras. Nollställs när den anropas.
   */
  consumeSwipe: () => boolean;
}

/**
 * Svep med pekarhändelser (`touch-action: pan-y` på elementet): vänster =
 * `onLeft` (glider ut, t.ex. ta bort), höger = `onRight` (studsar tillbaka, t.ex. favorit).
 * Utan `onLeft`/`onRight` går det inte att svepa åt det hållet.
 */
export function useSwipe(
  ref: RefObject<HTMLElement | null>,
  onLeft: (() => void) | undefined,
  onRight: (() => void) | undefined,
): Swipe {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const swiped = useRef(false);
  const enabled = onLeft !== undefined || onRight !== undefined;

  function threshold(): number {
    return Math.max(80, (ref.current?.offsetWidth ?? 300) * TRIGGER_FRACTION);
  }

  function clamp(dx: number): number {
    if (dx < 0) return onLeft ? dx : 0;
    return onRight ? Math.min(MAX_RIGHT, dx) : 0;
  }

  function end(e: PointerEvent, cancelled: boolean) {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (!d.horizontal) return;
    // Ett svep ska inte också räknas som ett tryck på raden.
    swiped.current = true;
    const dx = e.clientX - d.x;
    if (!cancelled && onLeft && dx <= -threshold()) {
      setOffset(-(ref.current?.offsetWidth ?? 400));
      onLeft();
      return;
    }
    setOffset(0);
    if (!cancelled && onRight && dx >= Math.min(MAX_RIGHT, threshold())) onRight();
  }

  const handlers: SwipeHandlers = {
    onPointerDown(e) {
      if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, horizontal: null };
      swiped.current = false;
    },
    onPointerMove(e) {
      const d = drag.current;
      if (d?.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (d.horizontal === null) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        d.horizontal = Math.abs(dx) > Math.abs(dy);
        if (d.horizontal) {
          setDragging(true);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Pekaren finns inte längre (t.ex. syntetiska händelser) – svepet fungerar ändå.
          }
        }
      }
      if (d.horizontal) setOffset(clamp(dx));
    },
    onPointerUp(e) {
      end(e, false);
    },
    onPointerCancel(e) {
      end(e, true);
    },
  };

  return {
    offset,
    dragging,
    handlers,
    consumeSwipe() {
      const was = swiped.current;
      swiped.current = false;
      return was;
    },
  };
}
