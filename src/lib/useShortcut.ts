import { useCallback, useLayoutEffect, useState } from 'react';
import { addWater, undoLastWater } from '../db/db.ts';
import { todayIso } from './dates.ts';
import { isEnabled, setFeature, type FeatureFlags, type Features } from './features.ts';
import { parseShortcut, shortcutOutcome, withoutAction, type Shortcut } from './shortcuts.ts';

export type ShortcutToastState =
  | { kind: 'water'; ml: number; date: string; undone: boolean }
  | { kind: 'disabled'; shortcut: Shortcut; feature: 'vatten' | 'mat' };

let consumed = false;

/**
 * Läser `?action=` en gång per sidladdning och tar bort den ur adressen, så att
 * en omladdning eller ett bokmärke inte kör genvägen igen.
 */
function takeShortcut(): Shortcut | null {
  if (consumed) return null;
  consumed = true;
  const { pathname, search, hash } = window.location;
  const shortcut = parseShortcut(search);
  if (shortcut) window.history.replaceState(null, '', withoutAction(pathname, search, hash));
  return shortcut;
}

export function resetShortcutForTests(): void {
  consumed = false;
}

/** Byter hash utan ny historikpost och meddelar useHashRoute direkt. */
function navigate(hash: string): void {
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}${hash}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export interface ShortcutState {
  toast: ShortcutToastState | null;
  /** Ökas när genvägen ändrat data, så att sidan läser om. */
  dataVersion: number;
  undo: () => Promise<void>;
  enable: () => Promise<void>;
  dismiss: () => void;
}

/** Kör genvägen från appikonen när funktionsbrytarna är lästa. */
export function useShortcut(features: Features): ShortcutState {
  const [toast, setToast] = useState<ShortcutToastState | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const run = useCallback(async (shortcut: Shortcut, flags: FeatureFlags) => {
    const outcome = shortcutOutcome(shortcut, (f) => isEnabled(flags, f));
    switch (outcome.kind) {
      case 'open':
        setToast(null);
        navigate(outcome.hash);
        return;
      case 'add-water': {
        navigate(outcome.hash);
        const date = todayIso();
        await addWater(date, outcome.ml);
        setDataVersion((v) => v + 1);
        setToast({ kind: 'water', ml: outcome.ml, date, undone: false });
        return;
      }
      case 'disabled':
        setToast({ kind: 'disabled', shortcut, feature: outcome.feature });
        return;
    }
  }, []);

  const { loaded, flags } = features;
  useLayoutEffect(() => {
    if (!loaded) return;
    const shortcut = takeShortcut();
    // Som mikrouppgift: efter effekten men före nästa målning.
    if (shortcut) {
      queueMicrotask(() => {
        void run(shortcut, flags);
      });
    }
  }, [loaded, flags, run]);

  const undo = useCallback(async () => {
    if (toast?.kind !== 'water' || toast.undone) return;
    await undoLastWater(toast.date);
    setDataVersion((v) => v + 1);
    setToast({ ...toast, undone: true });
  }, [toast]);

  const enable = useCallback(async () => {
    if (toast?.kind !== 'disabled') return;
    await setFeature(toast.feature, true);
    await run(toast.shortcut, { ...flags, [toast.feature]: true });
  }, [toast, flags, run]);

  const dismiss = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, dataVersion, undo, enable, dismiss };
}
