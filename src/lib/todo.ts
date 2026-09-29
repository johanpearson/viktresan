/**
 * Översikt → Att göra idag: det som väntar idag (tillskott att bocka av, dos på dosdagen,
 * planerade pass, obesvarade pass, påminnelsen om säkerhetskopia) och raden "Nästa dos" för
 * dagar som inte är dosdagar. Rena funktioner – komponenten `TodoCard` ritar dem.
 */
import type {
  Injection,
  Medication,
  Supplement,
  SupplementIntake,
  Workout,
  WorkoutPlan,
} from '../db/db.ts';
import { addDays, todayIso, toDayNumber } from './dates.ts';
import { formatDayMonth, formatMg } from './format.ts';
import { dueToday, nextDose, siteLabel, suggestSite, type DoseItem } from './glp1.ts';
import { supplementsOn, untaken } from './supplements.ts';
import { findUnanswered, todaysWorkouts, type WorkoutItem } from './workouts.ts';

export interface TodoInput {
  supplements: readonly Supplement[];
  supplementLog: readonly SupplementIntake[];
  medications: readonly Medication[];
  injections: readonly Injection[];
  workouts: readonly Workout[];
  workoutPlans: readonly WorkoutPlan[];
  /** Påslagna funktioner: tillskott, GLP-1 och träning. */
  enabled: { tillskott: boolean; glp1: boolean; traning: boolean };
  /** Påminnelsen om säkerhetskopia ska visas. */
  backupDue: boolean;
}

export interface NextDoseLine {
  date: string;
  time?: string | undefined;
  doseMg: number | null;
  site: string;
}

export interface Todo {
  /** Planerade tillskott idag som inte bockats av. */
  supplements: Supplement[];
  /** Dagens doser som inte loggats (dosdag). */
  doses: DoseItem[];
  /** Förslag på injektionsställe för dagens dos. */
  site: string | null;
  /** Dagens planerade pass (inte passerade – de är obesvarade). */
  workouts: WorkoutItem[];
  /** Planerade pass vars tid passerat: "Blev passet av?". */
  unanswered: WorkoutItem[];
  backup: boolean;
  /** Nästa dos när idag inte är dosdag, annars `null`. */
  nextDose: NextDoseLine | null;
  /** Inget väntar idag – kortet ersätts av raden "Allt klart för idag". */
  empty: boolean;
}

export function buildTodo(input: TodoInput, now: Date): Todo {
  const today = todayIso(now);
  const { enabled } = input;
  const supplements = enabled.tillskott
    ? untaken(supplementsOn(input.supplements, input.supplementLog, today))
    : [];
  const doses = enabled.glp1 ? dueToday(input.medications, input.injections, now) : [];
  const workouts = enabled.traning
    ? todaysWorkouts(input.workouts, input.workoutPlans, now).filter((w) => w.status === 'planerad')
    : [];
  const unanswered = enabled.traning ? findUnanswered(input.workouts, input.workoutPlans, now) : [];
  const site = enabled.glp1 ? siteLabel(suggestSite(input.injections)) : null;
  const next =
    enabled.glp1 && doses.length === 0 ? nextDose(input.medications, input.injections, now) : null;
  return {
    supplements,
    doses,
    site: doses.length > 0 ? site : null,
    workouts,
    unanswered,
    backup: input.backupDue,
    nextDose: next && site ? { date: next.date, time: next.time, doseMg: next.doseMg, site } : null,
    empty:
      supplements.length === 0 &&
      doses.length === 0 &&
      workouts.length === 0 &&
      unanswered.length === 0 &&
      !input.backupDue,
  };
}

const WEEKDAYS = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];

/** "idag", "imorgon" eller "lör 4 okt". */
export function doseDayText(date: string, today: string): string {
  if (date === today) return 'idag';
  if (date === addDays(today, 1)) return 'imorgon';
  const weekday = WEEKDAYS[(((toDayNumber(date) + 3) % 7) + 7) % 7] ?? '';
  return `${weekday} ${formatDayMonth(date)}`;
}

/** "Nästa dos lör 4 okt · 2,5 mg · buk höger". */
export function nextDoseText(next: NextDoseLine, today: string): string {
  const parts = [`Nästa dos ${doseDayText(next.date, today)}`];
  if (next.doseMg != null) parts.push(formatMg(next.doseMg));
  parts.push(next.site.toLowerCase());
  return parts.join(' · ');
}
