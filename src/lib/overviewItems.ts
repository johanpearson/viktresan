/**
 * Ringar och kort på Översikt som kan döljas (Inställningar → Översikt). Dolda id:n lagras i
 * `preferences.overviewHidden` på enheten. Viktkortet går inte att dölja – det är sidans status.
 */
import { setPreference, usePreferences } from './preferences.ts';
import type { FeatureGated } from './features.ts';

export type OverviewItemId =
  | 'ring-dryck'
  | 'ring-kcal'
  | 'ring-protein'
  | 'ring-fiber'
  | 'veckorad'
  | 'att-gora'
  | 'veckosummering'
  | 'milstolpe'
  | 'plata';

export interface OverviewItem extends FeatureGated {
  id: OverviewItemId;
  group: 'ring' | 'kort';
  label: string;
  description: string;
}

export const OVERVIEW_ITEMS: readonly OverviewItem[] = [
  {
    id: 'ring-dryck',
    group: 'ring',
    label: 'Dryck',
    description: 'Dagens dryck mot dryckesmålet.',
    feature: 'vatten',
  },
  {
    id: 'ring-kcal',
    group: 'ring',
    label: 'Kalorier',
    description: 'Dagens intag mot kalorimålet.',
    feature: 'mat',
  },
  {
    id: 'ring-protein',
    group: 'ring',
    label: 'Protein',
    description: 'Dagens protein mot proteinmålet.',
    feature: 'mat',
  },
  {
    id: 'ring-fiber',
    group: 'ring',
    label: 'Fiber',
    description: 'Visas när fibermålet är på.',
    feature: 'mat',
  },
  {
    id: 'veckorad',
    group: 'kort',
    label: 'Veckoraden',
    description: 'Kvar av veckans kalorier under ringarna.',
    feature: 'mat',
  },
  {
    id: 'att-gora',
    group: 'kort',
    label: 'Att göra idag',
    description: 'Tillskott, dos, pass och påminnelser som väntar idag.',
  },
  {
    id: 'veckosummering',
    group: 'kort',
    label: 'Veckosummering',
    description: 'Förra veckan, från måndag tills du stänger den.',
  },
  {
    id: 'milstolpe',
    group: 'kort',
    label: 'Ny milstolpe',
    description: 'En milstolpe du nått den senaste veckan.',
  },
  {
    id: 'plata',
    group: 'kort',
    label: 'Platåanalys',
    description: 'När vikten stått still i tre veckor.',
  },
];

/** Vad Översikt visar: `shows(id)` är falskt för dolda ringar och kort. */
export function useOverviewItems(): {
  shows: (id: OverviewItemId) => boolean;
  setShown: (id: OverviewItemId, shown: boolean) => Promise<void>;
} {
  const { prefs } = usePreferences();
  const hidden = prefs.overviewHidden;
  return {
    shows: (id) => !hidden.includes(id),
    setShown: (id, shown) =>
      setPreference(
        'overviewHidden',
        shown ? hidden.filter((h) => h !== id) : [...hidden.filter((h) => h !== id), id],
      ),
  };
}
