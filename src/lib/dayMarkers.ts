/** Loggtyper per dag, som de visas i Kalender och i Översiktens "Idag". */
import type { DayLog } from './calendar.ts';
import type { FeatureGated } from './features.ts';
import { formatCm, formatInt, formatKcal, formatKg } from './format.ts';

export interface DayMarker extends FeatureGated {
  id: string;
  label: string;
  /** Värdet för dagen, eller null om inget loggats. */
  value: (day: DayLog) => string | null;
}

/** Vad som markeras i kalendern, i visningsordning. */
export const DAY_MARKERS: readonly DayMarker[] = [
  {
    id: 'vikt',
    label: 'Vikt',
    value: (d) => (d.weightKg == null ? null : formatKg(d.weightKg)),
  },
  {
    id: 'midja',
    label: 'Midja',
    feature: 'midja',
    value: (d) => (d.waistCm == null ? null : formatCm(d.waistCm)),
  },
  {
    id: 'steg',
    label: 'Steg',
    feature: 'steg',
    value: (d) => (d.steps == null ? null : `${formatInt(d.steps)} steg`),
  },
  {
    id: 'mat',
    label: 'Mat',
    feature: 'mat',
    value: (d) => (d.kcal == null ? null : formatKcal(d.kcal)),
  },
  {
    id: 'bilder',
    label: 'Bilder',
    feature: 'bilder',
    value: (d) =>
      d.photos == null ? null : d.photos === 1 ? '1 bild' : `${formatInt(d.photos)} bilder`,
  },
];

export interface LoggedValue {
  marker: DayMarker;
  value: string;
}

/** De markörer som har ett värde för dagen, i markörernas ordning. */
export function loggedValues(
  markers: readonly DayMarker[],
  day: DayLog | undefined,
): LoggedValue[] {
  if (!day) return [];
  return markers.flatMap((marker) => {
    const value = marker.value(day);
    return value == null ? [] : [{ marker, value }];
  });
}
