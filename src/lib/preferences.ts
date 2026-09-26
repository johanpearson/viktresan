/**
 * Visningsinställningar som hör till enheten (inte till säkerhetskopian):
 * trendvikt som huvudsiffra, vilket veckokort som stängts, profilsida och kameravyns
 * spökbild. Lagras i `settings`
 * under `preferences`. Delas av alla komponenter via useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';
import { SETTING_PREFERENCES, getSetting, setSetting } from '../db/db.ts';
import { isProfileSide, type ProfileSide } from './photoSessions.ts';

export interface Preferences {
  /** Översikt visar trendvikten stort och dagsvikten litet under. */
  trendHero: boolean;
  /** Måndagen för det senast stängda veckokortet. */
  weekCardDismissed: string | null;
  /** Vilken sida som vänds mot kameran i profilbilder. */
  profileSide: ProfileSide;
  /** Kameravyn visar senaste bilden i samma vinkel som överlägg. */
  ghostEnabled: boolean;
  /** Spökbildens opacitet, 0,1–0,9. */
  ghostOpacity: number;
}

export const GHOST_OPACITY_MIN = 0.1;
export const GHOST_OPACITY_MAX = 0.9;

export const DEFAULT_PREFERENCES: Preferences = {
  trendHero: true,
  weekCardDismissed: null,
  profileSide: 'vanster',
  ghostEnabled: true,
  ghostOpacity: 0.4,
};

/** Tolkar det lagrade värdet; okända eller felaktiga fält får standardvärdet. */
export function parsePreferences(raw: unknown): Preferences {
  const stored = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    trendHero:
      typeof stored.trendHero === 'boolean' ? stored.trendHero : DEFAULT_PREFERENCES.trendHero,
    weekCardDismissed:
      typeof stored.weekCardDismissed === 'string' ? stored.weekCardDismissed : null,
    profileSide: isProfileSide(stored.profileSide)
      ? stored.profileSide
      : DEFAULT_PREFERENCES.profileSide,
    ghostEnabled:
      typeof stored.ghostEnabled === 'boolean'
        ? stored.ghostEnabled
        : DEFAULT_PREFERENCES.ghostEnabled,
    ghostOpacity:
      typeof stored.ghostOpacity === 'number' &&
      stored.ghostOpacity >= GHOST_OPACITY_MIN &&
      stored.ghostOpacity <= GHOST_OPACITY_MAX
        ? stored.ghostOpacity
        : DEFAULT_PREFERENCES.ghostOpacity,
  };
}

interface State {
  loaded: boolean;
  prefs: Preferences;
}

let state: State = { loaded: false, prefs: DEFAULT_PREFERENCES };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: State): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  void initPreferences();
  return () => {
    listeners.delete(listener);
  };
}

function getState(): State {
  return state;
}

export function initPreferences(): Promise<void> {
  loading ??= (async () => {
    let prefs = DEFAULT_PREFERENCES;
    try {
      prefs = parsePreferences(await getSetting(SETTING_PREFERENCES));
    } catch {
      // Standardvärdena gäller.
    }
    setState({ loaded: true, prefs });
  })();
  return loading;
}

export async function setPreference<K extends keyof Preferences>(
  key: K,
  value: Preferences[K],
): Promise<void> {
  const prefs = { ...state.prefs, [key]: value };
  setState({ loaded: true, prefs });
  await setSetting(SETTING_PREFERENCES, prefs);
}

export function resetPreferencesForTests(): void {
  loading = null;
  state = { loaded: false, prefs: DEFAULT_PREFERENCES };
}

export function usePreferences(): State {
  return useSyncExternalStore(subscribe, getState);
}
