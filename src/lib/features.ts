/**
 * Funktionsbrytare. Varje valfri del av appen hör till en funktion som kan slås
 * av under Inställningar → Funktioner. En avstängd funktion döljs överallt, men
 * datan ligger kvar och ingår i säkerhetskopior.
 *
 * Vyer filtrerar med `useFeatures()` – antingen `filter(lista)` på poster som har
 * ett `feature`-fält, eller `<Feature id="…">` runt enstaka delar.
 */
import { useSyncExternalStore } from 'react';
import { SETTING_FEATURES, getSetting, setSetting } from '../db/db.ts';

export type FeatureId = 'steg' | 'midja' | 'mat' | 'vatten' | 'traning' | 'glp1' | 'bilder';

export interface FeatureInfo {
  id: FeatureId;
  label: string;
  description: string;
  /** Standardläge på en ny enhet. */
  defaultOn: boolean;
  /** Finns det något att visa ännu? Kommande funktioner kan inte slås på. */
  available: boolean;
}

/** Ordningen här styr ordningen under Inställningar → Funktioner. */
export const FEATURES: readonly FeatureInfo[] = [
  {
    id: 'steg',
    label: 'Steg',
    description: 'Logga steg per dag och se stapelgraf.',
    defaultOn: true,
    available: true,
  },
  {
    id: 'midja',
    label: 'Midjemått',
    description: 'Logga midjemått.',
    defaultOn: true,
    available: true,
  },
  {
    id: 'mat',
    label: 'Mat',
    description: 'Matlogg, livsmedel och kalorimål.',
    defaultOn: true,
    available: true,
  },
  {
    id: 'vatten',
    label: 'Vatten',
    description: 'Logga hur mycket du dricker.',
    defaultOn: false,
    available: false,
  },
  {
    id: 'traning',
    label: 'Träning',
    description: 'Logga träningspass.',
    defaultOn: false,
    available: false,
  },
  {
    id: 'glp1',
    label: 'GLP-1',
    description: 'Logga doser av GLP-1-läkemedel.',
    defaultOn: false,
    available: false,
  },
  {
    id: 'bilder',
    label: 'Bilder',
    description: 'Progressbilder och jämförelser.',
    defaultOn: true,
    available: true,
  },
];

export type FeatureFlags = Readonly<Record<FeatureId, boolean>>;

export const DEFAULT_FLAGS: FeatureFlags = Object.fromEntries(
  FEATURES.map((f) => [f.id, f.defaultOn && f.available]),
) as Record<FeatureId, boolean>;

/** Något som bara visas när en funktion är på. Utan `feature` visas det alltid. */
export interface FeatureGated {
  feature?: FeatureId;
}

export function isEnabled(flags: FeatureFlags, feature: FeatureId | undefined): boolean {
  return feature === undefined || flags[feature];
}

export function filterEnabled<T extends FeatureGated>(
  flags: FeatureFlags,
  items: readonly T[],
): T[] {
  return items.filter((item) => isEnabled(flags, item.feature));
}

/**
 * Tolkar det lagrade värdet. Okända nycklar släpps, saknade får standardläget och
 * funktioner som inte finns ännu är alltid av.
 */
export function parseFlags(raw: unknown): FeatureFlags {
  const stored = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const flags = { ...DEFAULT_FLAGS };
  for (const f of FEATURES) {
    const value = stored[f.id];
    if (typeof value === 'boolean') flags[f.id] = value && f.available;
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Tillstånd (delas av alla komponenter)

interface State {
  loaded: boolean;
  flags: FeatureFlags;
}

let state: State = { loaded: false, flags: DEFAULT_FLAGS };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: State): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  void initFeatures();
  return () => {
    listeners.delete(listener);
  };
}

function getState(): State {
  return state;
}

/** Läser inställningen en gång. Går läsningen fel gäller standardlägena. */
export function initFeatures(): Promise<void> {
  loading ??= (async () => {
    let flags = DEFAULT_FLAGS;
    try {
      flags = parseFlags(await getSetting(SETTING_FEATURES));
    } catch {
      // Standardlägena gäller.
    }
    setState({ loaded: true, flags });
  })();
  return loading;
}

export async function setFeature(id: FeatureId, on: boolean): Promise<void> {
  const flags = parseFlags({ ...state.flags, [id]: on });
  setState({ loaded: true, flags });
  await setSetting(SETTING_FEATURES, flags);
}

export function resetFeaturesForTests(): void {
  loading = null;
  state = { loaded: false, flags: DEFAULT_FLAGS };
}

export interface Features {
  /** Falskt tills inställningen är läst – vyer som beror på den kan vänta. */
  loaded: boolean;
  flags: FeatureFlags;
  isEnabled: (feature: FeatureId | undefined) => boolean;
  filter: <T extends FeatureGated>(items: readonly T[]) => T[];
}

/** Den centrala hooken: vilka funktioner är på? */
export function useFeatures(): Features {
  const { loaded, flags } = useSyncExternalStore(subscribe, getState);
  return {
    loaded,
    flags,
    isEnabled: (feature) => isEnabled(flags, feature),
    filter: (items) => filterEnabled(flags, items),
  };
}
