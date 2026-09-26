/** Loggtyper per dag, som de visas i Kalender och i Översiktens "Idag". */
import type { DayLog, DayWorkout } from './calendar.ts';
import type { FeatureGated } from './features.ts';
import { formatCm, formatInt, formatKcal, formatKg, formatMl } from './format.ts';
import { describeAppetite, describeDose, type DoseItem } from './glp1.ts';
import type { DisplayStatus } from './workouts.ts';

export interface DayMarker extends FeatureGated {
  id: string;
  label: string;
  /** Värdet för dagen, eller null om inget loggats. */
  value: (day: DayLog) => string | null;
  /**
   * En prick per post med en extra klass, t.ex. passets status. Utan `dots` blir
   * det en prick när det finns ett värde.
   */
  dots?: (day: DayLog) => string[];
}

const STATUS_WORDS: Record<DisplayStatus, [one: string, many: string]> = {
  genomford: ['genomfört', 'genomförda'],
  hoppad: ['hoppat över', 'hoppade över'],
  obesvarad: ['obesvarat', 'obesvarade'],
  planerad: ['planerat', 'planerade'],
};

/** "1 genomfört · 2 planerade" – i statusordningen ovan. */
export function workoutSummary(workouts: readonly DayWorkout[]): string {
  const parts: string[] = [];
  for (const status of Object.keys(STATUS_WORDS) as DisplayStatus[]) {
    const n = workouts.filter((w) => w.status === status).length;
    if (n > 0) parts.push(`${String(n)} ${STATUS_WORDS[status][n === 1 ? 0 : 1]}`);
  }
  return parts.join(' · ');
}

/** "Wegovy 0,5 mg" (loggad) eller "Wegovy 0,5 mg planerad". */
export function doseSummary(doses: readonly DoseItem[]): string {
  return doses
    .map((d) => (d.status === 'loggad' ? describeDose(d) : `${describeDose(d)} planerad`))
    .join(' · ');
}

/** "Aptit 3 av 5 · Illamående, Trötthet". */
export function symptomSummary(s: { appetite?: number; sideEffects: string[] }): string {
  const parts: string[] = [];
  if (s.appetite != null) parts.push(`Aptit ${describeAppetite(s.appetite)}`);
  if (s.sideEffects.length > 0) parts.push(s.sideEffects.join(', '));
  return parts.join(' · ');
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
    id: 'vatten',
    label: 'Dryck',
    feature: 'vatten',
    value: (d) => (d.waterMl == null ? null : formatMl(d.waterMl)),
  },
  {
    id: 'traning',
    label: 'Träning',
    feature: 'traning',
    value: (d) => (d.workouts?.length ? workoutSummary(d.workouts) : null),
    dots: (d) => (d.workouts ?? []).map((w) => `status-${w.status}`),
  },
  {
    id: 'glp1',
    label: 'Dos',
    feature: 'glp1',
    value: (d) => (d.doses?.length ? doseSummary(d.doses) : null),
    dots: (d) => (d.doses ?? []).map((dose) => `dose-${dose.status}`),
  },
  {
    id: 'maende',
    label: 'Mående',
    feature: 'glp1',
    value: (d) => (d.symptoms ? symptomSummary(d.symptoms) || null : null),
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
