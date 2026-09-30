/**
 * Visningsinställningar som hör till enheten (inte till säkerhetskopian):
 * trendvikt som huvudsiffra, vilket veckokort som stängts, profilsida, kameravyns
 * spökbild, vad "Fråga AI" tar med i prompten, haptik, stängt platåkort, rapportens val och vad Översikt
 * döljer (ringar och kort), senast stängda milstolpekortet och dolda näringsetiketter. Lagras i `settings`
 * under `preferences`. Delas av alla komponenter via useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';
import { SETTING_PREFERENCES, getSetting, setSetting } from '../db/db.ts';
import { DEFAULT_AI_OPTIONS, parseAiOptions, type AiOptions } from './aiPrompt.ts';
import { isClaimId, type ClaimId } from '../data/nutritionClaims.ts';
import { isProfileSide, type ProfileSide } from './photoSessions.ts';
import { DEFAULT_REPORT_SETTINGS, parseReportSettings, type ReportSettings } from './report.ts';

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
  /** Kryssrutorna i "Fråga AI" (GLP-1 är av som standard). */
  aiOptions: AiOptions;
  /** Lätt vibration vid spara/klar (navigator.vibrate). */
  haptics: boolean;
  /** Dagen platåkortet senast stängdes (visas igen tidigast 14 dagar senare). */
  plateauDismissed: string | null;
  /** Rapportens period och sektioner (Framsteg → Rapport). */
  report: ReportSettings;
  /** Instruktionen för "Spara som PDF" har visats. */
  reportPrintHintSeen: boolean;
  /** Ringar och kort som är dolda på Översikt (`OVERVIEW_ITEMS`, Inställningar → Översikt). */
  overviewHidden: readonly string[];
  /** Id för milstolpen vars kort på Översikt senast stängdes. */
  milestoneCardDismissed: string | null;
  /** Näringsetiketter som inte visas (Inställningar → Visning). Alla visas som standard. */
  claimsHidden: readonly ClaimId[];
}

export const GHOST_OPACITY_MIN = 0.1;
export const GHOST_OPACITY_MAX = 0.9;

export const DEFAULT_PREFERENCES: Preferences = {
  trendHero: true,
  weekCardDismissed: null,
  profileSide: 'vanster',
  ghostEnabled: true,
  ghostOpacity: 0.4,
  aiOptions: DEFAULT_AI_OPTIONS,
  haptics: true,
  plateauDismissed: null,
  report: DEFAULT_REPORT_SETTINGS,
  reportPrintHintSeen: false,
  overviewHidden: [],
  milestoneCardDismissed: null,
  claimsHidden: [],
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
    aiOptions: parseAiOptions(stored.aiOptions),
    haptics: typeof stored.haptics === 'boolean' ? stored.haptics : DEFAULT_PREFERENCES.haptics,
    plateauDismissed: typeof stored.plateauDismissed === 'string' ? stored.plateauDismissed : null,
    report: parseReportSettings(stored.report),
    reportPrintHintSeen: stored.reportPrintHintSeen === true,
    overviewHidden: Array.isArray(stored.overviewHidden)
      ? stored.overviewHidden.filter((id): id is string => typeof id === 'string')
      : [],
    milestoneCardDismissed:
      typeof stored.milestoneCardDismissed === 'string' ? stored.milestoneCardDismissed : null,
    claimsHidden: Array.isArray(stored.claimsHidden)
      ? [...new Set(stored.claimsHidden.filter(isClaimId))]
      : [],
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

/** Aktuella inställningar utanför React (t.ex. för haptik). */
export function currentPreferences(): Preferences {
  return state.prefs;
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
