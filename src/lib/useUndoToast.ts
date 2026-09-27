import { useCallback, useState } from 'react';

export interface UndoToastState {
  message: string;
  /** Visar "Ångra" i kvittensen. */
  undo?: (() => Promise<void> | void) | undefined;
}

/**
 * Kvittens med Ångra efter en borttagning i en lista (svep eller radmeny). Renderas med
 * `Toast`: `{toast && <Toast message={toast.message} onUndo={undoHandler} onClose={close} />}`.
 */
export function useUndoToast() {
  const [toast, setToast] = useState<UndoToastState | null>(null);
  const close = useCallback(() => {
    setToast(null);
  }, []);
  const show = useCallback((message: string, undo?: () => Promise<void> | void) => {
    setToast({ message, undo });
  }, []);
  const undo = toast?.undo;
  const onUndo = undo
    ? () => {
        setToast(null);
        void undo();
      }
    : undefined;
  return { toast, show, close, onUndo };
}
