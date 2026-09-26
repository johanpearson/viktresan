/**
 * Träning: återkommande scheman, status och vilka pass som väntar på svar.
 * Rena funktioner – "nu" skickas in så att allt går att testa.
 *
 * Pass ur ett schema genereras när de visas och sparas i `workouts` först när de
 * besvaras, med id `<planId>:<datum>`. Ett sparat pass ersätter alltid det genererade.
 */
import type { Workout, WorkoutPlan } from '../db/db.ts';
import { addDays, toDayNumber, todayIso } from './dates.ts';

export type WorkoutStatus = 'planerad' | 'genomford' | 'hoppad';
export type Intensity = 'latt' | 'medel' | 'hog';

/** Status som den visas: ett planerat pass vars tid passerat är obesvarat. */
export type DisplayStatus = 'planerad' | 'obesvarad' | 'genomford' | 'hoppad';

export const INTENSITIES: readonly { id: Intensity; label: string }[] = [
  { id: 'latt', label: 'Lätt' },
  { id: 'medel', label: 'Medel' },
  { id: 'hog', label: 'Hög' },
];

export const WORKOUT_STATUSES: readonly { id: WorkoutStatus; label: string }[] = [
  { id: 'planerad', label: 'Planerad' },
  { id: 'genomford', label: 'Genomförd' },
  { id: 'hoppad', label: 'Hoppade över' },
];

export const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  planerad: 'Planerad',
  obesvarad: 'Obesvarad',
  genomford: 'Genomförd',
  hoppad: 'Hoppade över',
};

/** Förvalda passtyper. Egna typer tas från tidigare pass och scheman. */
export const PRESET_WORKOUT_TYPES: readonly string[] = [
  'Promenad',
  'Löpning',
  'Cykling',
  'Styrketräning',
  'Simning',
  'Yoga',
];

/** Veckodagar, måndag först: [kort, lång]. */
export const WEEKDAYS: readonly (readonly [short: string, long: string])[] = [
  ['mån', 'måndag'],
  ['tis', 'tisdag'],
  ['ons', 'onsdag'],
  ['tor', 'torsdag'],
  ['fre', 'fredag'],
  ['lör', 'lördag'],
  ['sön', 'söndag'],
];

/** Hur långt bakåt Översikt letar efter obesvarade pass. */
export const UNANSWERED_LOOKBACK_DAYS = 28;
/** Hur långt framåt "Kommande" letar. */
export const UPCOMING_HORIZON_DAYS = 90;

/** Ett pass i en vy: sparat eller genererat ur ett schema. */
export interface WorkoutItem extends Workout {
  /** Finns passet i databasen? Genererade schemapass sparas först när de besvaras. */
  stored: boolean;
}

export function intensityLabel(id: Intensity): string {
  return INTENSITIES.find((i) => i.id === id)?.label ?? id;
}

/** 0 = måndag … 6 = söndag. */
function weekday(iso: string): number {
  return (((toDayNumber(iso) + 3) % 7) + 7) % 7;
}

export function occurrenceId(planId: string, date: string): string {
  return `${planId}:${date}`;
}

/** Datum i [from, to] då schemat har ett pass. */
export function planDates(plan: WorkoutPlan, from: string, to: string): string[] {
  const first = plan.startDate > from ? plan.startDate : from;
  const last = plan.endDate != null && plan.endDate < to ? plan.endDate : to;
  const dates: string[] = [];
  if (first > last || plan.weekdays.length === 0) return dates;
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (plan.weekdays.includes(weekday(day))) dates.push(day);
  }
  return dates;
}

/** Det genererade (ännu inte sparade) passet för ett schema och ett datum. */
export function planOccurrence(plan: WorkoutPlan, date: string): WorkoutItem {
  const item: WorkoutItem = {
    id: occurrenceId(plan.id, date),
    date,
    time: plan.time,
    type: plan.type,
    durationMin: plan.durationMin,
    status: 'planerad',
    planId: plan.id,
    createdAt: plan.createdAt,
    stored: false,
  };
  if (plan.intensity !== undefined) item.intensity = plan.intensity;
  if (plan.note !== undefined) item.note = plan.note;
  return item;
}

function compareItems(a: Workout, b: Workout): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // Pass utan tid (hela dagen) sist.
  const ta = a.time ?? '99:99';
  const tb = b.time ?? '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.createdAt - b.createdAt;
}

/** Sparade pass och genererade schemapass i [from, to], i tidsordning. */
export function workoutsBetween(
  workouts: readonly Workout[],
  plans: readonly WorkoutPlan[],
  from: string,
  to: string,
): WorkoutItem[] {
  const items: WorkoutItem[] = [];
  const storedIds = new Set<string>();
  for (const w of workouts) {
    storedIds.add(w.id);
    if (w.date >= from && w.date <= to) items.push({ ...w, stored: true });
  }
  for (const plan of plans) {
    for (const date of planDates(plan, from, to)) {
      if (!storedIds.has(occurrenceId(plan.id, date))) items.push(planOccurrence(plan, date));
    }
  }
  return items.sort(compareItems);
}

/** Lokalt datum och klockslag ("HH:MM") för `now`. */
export function localNow(now: Date): { date: string; time: string } {
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return { date: todayIso(now), time: `${h}:${m}` };
}

/** Har passets tid passerat? Pass utan tid passerar när dagen är slut. */
export function hasPassed(item: { date: string; time?: string }, now: Date): boolean {
  const { date, time } = localNow(now);
  if (item.date !== date) return item.date < date;
  return item.time != null && item.time <= time;
}

export function displayStatus(item: Workout, now: Date): DisplayStatus {
  if (item.status !== 'planerad') return item.status;
  return hasPassed(item, now) ? 'obesvarad' : 'planerad';
}

/**
 * Planerade pass vars tid passerat utan svar, äldst först. Letar
 * `lookbackDays` bakåt – äldre pass syns bara i kalendern.
 */
export function findUnanswered(
  workouts: readonly Workout[],
  plans: readonly WorkoutPlan[],
  now: Date,
  lookbackDays = UNANSWERED_LOOKBACK_DAYS,
): WorkoutItem[] {
  const today = todayIso(now);
  return workoutsBetween(workouts, plans, addDays(today, -lookbackDays), today).filter(
    (w) => w.status === 'planerad' && hasPassed(w, now),
  );
}

/** Dagens pass, utom obesvarade som redan passerat (de visas i "Blev passet av?"). */
export function todaysWorkouts(
  workouts: readonly Workout[],
  plans: readonly WorkoutPlan[],
  now: Date,
): WorkoutItem[] {
  const today = todayIso(now);
  return workoutsBetween(workouts, plans, today, today).filter(
    (w) => displayStatus(w, now) !== 'obesvarad',
  );
}

/** De närmaste planerade passen efter idag. */
export function upcomingWorkouts(
  workouts: readonly Workout[],
  plans: readonly WorkoutPlan[],
  now: Date,
  count = 3,
): WorkoutItem[] {
  const today = todayIso(now);
  return workoutsBetween(workouts, plans, addDays(today, 1), addDays(today, UPCOMING_HORIZON_DAYS))
    .filter((w) => w.status === 'planerad')
    .slice(0, count);
}

export interface WorkoutAnswer {
  status: WorkoutStatus;
  durationMin?: number;
  /** `null` tar bort intensiteten. */
  intensity?: Intensity | null;
}

/** Posten som sparas när ett pass besvaras eller får ny status. */
export function answerWorkout(item: WorkoutItem, answer: WorkoutAnswer, now = Date.now()): Workout {
  const { stored, ...base } = item;
  const next: Workout = { ...base, status: answer.status };
  if (answer.durationMin !== undefined) next.durationMin = answer.durationMin;
  if (answer.intensity === null) delete next.intensity;
  else if (answer.intensity !== undefined) next.intensity = answer.intensity;
  if (stored) next.updatedAt = now;
  else next.createdAt = now;
  return next;
}

/** Förvalda typer följda av egna typer från tidigare pass och scheman (bokstavsordning). */
export function workoutTypes(
  workouts: readonly { type: string }[],
  plans: readonly { type: string }[],
): string[] {
  const own = new Set<string>();
  for (const { type } of [...workouts, ...plans]) {
    if (!PRESET_WORKOUT_TYPES.includes(type)) own.add(type);
  }
  return [...PRESET_WORKOUT_TYPES, ...[...own].sort((a, b) => a.localeCompare(b, 'sv'))];
}

/** "mån, ons, fre 07:00". Vardagar/alla dagar skrivs ut som sådana. */
export function describePlan(plan: Pick<WorkoutPlan, 'weekdays' | 'time'>): string {
  const days = [...plan.weekdays].sort((a, b) => a - b);
  let text: string;
  if (days.length === 7) text = 'Varje dag';
  else if (days.join() === '0,1,2,3,4') text = 'Vardagar';
  else text = days.map((d) => WEEKDAYS[d]?.[0] ?? '').join(', ');
  return `${text} ${plan.time}`;
}

/** "Löpning · 30 min · Medel". */
export function describeWorkout(w: Pick<Workout, 'type' | 'durationMin' | 'intensity'>): string {
  const parts = [w.type, `${String(w.durationMin)} min`];
  if (w.intensity) parts.push(intensityLabel(w.intensity));
  return parts.join(' · ');
}
