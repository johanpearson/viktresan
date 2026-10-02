import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface Drag {
  id: string;
  pointerId: number;
  /** Pekarens y där raden "står" i sin nuvarande plats. */
  originY: number;
  rowHeight: number;
  moved: boolean;
  /** Ordningen under dragningen. */
  list: string[];
}

export interface DragHandleProps {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Ändra ordning med ett dra-handtag (pekarhändelser) eller piltangenterna på handtaget. Raden byter
 * plats med grannen när den dragits över halva radhöjden; `onCommit` får den nya ordningen (och raden som flyttades) när
 * handtaget släpps (eller direkt vid piltangent). Radhöjden läses från `li` närmast handtaget.
 */
export function useDragReorder(
  ids: readonly string[],
  onCommit: (ids: string[], movedId: string) => void,
) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<{ id: string; offset: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const current = order ?? ids;

  function finish(commit: boolean) {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    setOrder(null);
    if (commit && d?.moved && d.list.join('\n') !== ids.join('\n')) onCommit(d.list, d.id);
  }

  function handleProps(id: string): DragHandleProps {
    return {
      onPointerDown(e) {
        // Inte rad-svepet eller ett tryck på raden.
        e.stopPropagation();
        if (e.button !== 0) return;
        const row = e.currentTarget.closest('li');
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pekaren är redan släppt – dragningen avslutas vid pointerup ändå.
        }
        drag.current = {
          id,
          pointerId: e.pointerId,
          originY: e.clientY,
          rowHeight: row?.offsetHeight ?? 56,
          moved: false,
          list: [...ids],
        };
        setOrder([...ids]);
        setDragging({ id, offset: 0 });
      },
      onPointerMove(e) {
        const d = drag.current;
        if (d?.pointerId !== e.pointerId) return;
        e.stopPropagation();
        let dy = e.clientY - d.originY;
        let list = d.list;
        let index = list.indexOf(id);
        const half = d.rowHeight / 2;
        while (dy > half && index < list.length - 1) {
          list = swap(list, index, index + 1);
          index += 1;
          d.originY += d.rowHeight;
          dy -= d.rowHeight;
          d.moved = true;
        }
        while (dy < -half && index > 0) {
          list = swap(list, index, index - 1);
          index -= 1;
          d.originY -= d.rowHeight;
          dy += d.rowHeight;
          d.moved = true;
        }
        if (list !== d.list) {
          d.list = list;
          setOrder(list);
        }
        setDragging({ id, offset: dy });
      },
      onPointerUp(e) {
        if (drag.current?.pointerId !== e.pointerId) return;
        e.stopPropagation();
        finish(true);
      },
      onPointerCancel(e) {
        if (drag.current?.pointerId !== e.pointerId) return;
        finish(false);
      },
      onKeyDown(e) {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const index = ids.indexOf(id);
        const to = e.key === 'ArrowUp' ? index - 1 : index + 1;
        if (index === -1 || to < 0 || to >= ids.length) return;
        onCommit(swap([...ids], index, to), id);
      },
    };
  }

  return { order: current, dragging, handleProps };
}

function swap(list: readonly string[], a: number, b: number): string[] {
  const next = [...list];
  const x = next[a];
  const y = next[b];
  if (x === undefined || y === undefined) return next;
  next[a] = y;
  next[b] = x;
  return next;
}
