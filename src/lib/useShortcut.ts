import { useCallback, useLayoutEffect, useState } from 'react';
import { addWater, undoLastWater } from '../db/db.ts';
import { todayIso } from './dates.ts';
import { isEnabled, setFeature, type FeatureFlags, type Features } from './features.ts';
import { navigate, replaceUrl } from './navigation.ts';
import {
  IMPORT_RECIPE_HASH,
  parseShare,
  setPendingShare,
  withoutShare,
  type SharedRecipe,
} from './shareTarget.ts';
import { parseShortcut, shortcutOutcome, withoutAction, type Shortcut } from './shortcuts.ts';

/** Det appen startades för: en genväg på appikonen eller en delning (share target). */
type Launch = { kind: 'shortcut'; shortcut: Shortcut } | { kind: 'share'; share: SharedRecipe };

export type ShortcutToastState =
  | { kind: 'water'; ml: number; date: string; undone: boolean }
  | { kind: 'disabled'; name: string; launch: Launch; feature: 'vatten' | 'mat' };

let consumed = false;

/**
 * Läser `?action=` (genväg) eller delningens parametrar en gång per sidladdning och tar
 * bort dem ur adressen, så att en omladdning eller ett bokmärke inte kör dem igen.
 */
function takeLaunch(): Launch | null {
  if (consumed) return null;
  consumed = true;
  const { pathname, search, hash } = window.location;
  const share = parseShare(search);
  if (share) {
    replaceUrl(withoutShare(pathname, search, hash));
    return { kind: 'share', share };
  }
  const shortcut = parseShortcut(search);
  if (shortcut) replaceUrl(withoutAction(pathname, search, hash));
  return shortcut ? { kind: 'shortcut', shortcut } : null;
}

export function resetShortcutForTests(): void {
  consumed = false;
}

export interface ShortcutState {
  toast: ShortcutToastState | null;
  /** Ökas när genvägen ändrat data, så att sidan läser om. */
  dataVersion: number;
  undo: () => Promise<void>;
  enable: () => Promise<void>;
  dismiss: () => void;
}

/** Kör genvägen från appikonen (eller delningen) när funktionsbrytarna är lästa. */
export function useShortcut(features: Features): ShortcutState {
  const [toast, setToast] = useState<ShortcutToastState | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const run = useCallback(async (launch: Launch, flags: FeatureFlags) => {
    if (launch.kind === 'share') {
      // Receptimporten finns under Mat.
      if (!isEnabled(flags, 'mat')) {
        setToast({ kind: 'disabled', name: 'Importera recept', launch, feature: 'mat' });
        return;
      }
      setToast(null);
      setPendingShare(launch.share);
      navigate(IMPORT_RECIPE_HASH);
      return;
    }
    const { shortcut } = launch;
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
        setToast({ kind: 'disabled', name: shortcut.name, launch, feature: outcome.feature });
        return;
    }
  }, []);

  const { loaded, flags } = features;
  useLayoutEffect(() => {
    if (!loaded) return;
    const launch = takeLaunch();
    // Som mikrouppgift: efter effekten men före nästa målning.
    if (launch) {
      queueMicrotask(() => {
        void run(launch, flags);
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
    await run(toast.launch, { ...flags, [toast.feature]: true });
  }, [toast, flags, run]);

  const dismiss = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, dataVersion, undo, enable, dismiss };
}
