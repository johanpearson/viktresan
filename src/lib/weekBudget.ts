/**
 * Veckobudget för kalorier – visas alltid under dagsmålet (Översikt → Idag, Mat → Dag).
 * Veckan är måndag–söndag och budgeten 7 × dagsmålet. Dagsmålet är fortsatt det primära
 * målet; veckan är en överblick. Rena funktioner utan I/O.
 *
 * - Dagar utan matlogg räknas som 0 kcal (de markeras "ej loggad" i veckopanelen).
 * - "≈ … /dag resten av veckan" = det som är kvar av budgeten när dagen började delat på
 *   dagarna som är kvar, idag medräknad. Det räknas på dagarna före idag, så det står still
 *   under dagen.
 * - Per dag-förslaget går aldrig under kalorigolvet. Räcker inte budgeten sägs det sakligt
 *   och överskottet föreslås fördelat över nästa vecka i stället.
 * - Saldot = loggat − planerat (dagsmålet per dag) för dagarna före idag – neutralt, utan
 *   värdering.
 */
import { addDays } from './dates.ts';
import { formatInt, formatKcal, formatSignedKcal } from './format.ts';
import { mondayOf } from './weekSummary.ts';

export interface WeekBudgetInput {
  /** Dagsmålet (planens kalorimål). */
  dailyTargetKcal: number;
  floorKcal: number;
  /** Intag per loggad dag (dagar utan matlogg saknas). */
  intake: readonly { date: string; kcal: number }[];
  today: string;
  /** Ett datum i veckan som visas (standard: idag). */
  weekOf?: string;
}

export interface WeekShortfall {
  /** Budgeten är redan överskriden (loggat inkl. idag > budget). */
  exceeded: boolean;
  /** Loggat inkl. idag − budget, när budgeten redan är överskriden. */
  exceededKcal: number;
  /** Det veckan går över budgeten med om resten av veckan äts på kalorigolvet. */
  overKcal: number;
  /** `overKcal` fördelat över nästa veckas sju dagar. */
  nextWeekPerDayKcal: number;
}

export type WeekDayStatus = 'past' | 'today' | 'future';

export interface WeekDay {
  date: string;
  /** Loggat, `null` = ingen matlogg den dagen. */
  kcal: number | null;
  status: WeekDayStatus;
}

export interface WeekBudget {
  /** Måndag. */
  from: string;
  /** Söndag. */
  to: string;
  dailyTargetKcal: number;
  budgetKcal: number;
  /** Loggat från måndag till och med idag (eller hela veckan när den är slut). */
  eatenKcal: number;
  /** Budget − loggat. Negativt = över budgeten. */
  remainingKcal: number;
  /** Dagar kvar i veckan, idag medräknad (0 när veckan är slut). */
  daysLeft: number;
  /** Per dag resten av veckan (aldrig under golvet), `null` när veckan är slut. */
  perDayKcal: number | null;
  /** Loggat − planerat för dagarna före idag (hela veckan när den är slut). */
  balanceKcal: number;
  /** Dagar före idag utan matlogg (räknade som 0 kcal). */
  unloggedDays: number;
  floorKcal: number;
  /** Satt när budgeten inte räcker till golvet resten av veckan. */
  shortfall: WeekShortfall | null;
  /** Måndag–söndag. */
  days: readonly WeekDay[];
}

export function weekBudget({
  dailyTargetKcal,
  floorKcal,
  intake,
  today,
  weekOf = today,
}: WeekBudgetInput): WeekBudget {
  const from = mondayOf(weekOf);
  const to = addDays(from, 6);
  const target = Math.round(dailyTargetKcal);
  const budgetKcal = target * 7;
  const byDate = new Map(intake.map((d) => [d.date, d.kcal]));

  const days: WeekDay[] = [];
  let eatenBefore = 0;
  let elapsed = 0;
  let unloggedDays = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(from, i);
    const kcal = byDate.get(date);
    const status: WeekDayStatus = date < today ? 'past' : date === today ? 'today' : 'future';
    days.push({ date, kcal: kcal === undefined ? null : Math.round(kcal), status });
    if (status === 'past') {
      elapsed++;
      if (kcal === undefined) unloggedDays++;
      else eatenBefore += kcal;
    }
  }
  const eatenToday = byDate.get(today) ?? 0;
  const daysLeft = 7 - elapsed;
  const eaten = eatenBefore + (daysLeft > 0 && today >= from ? eatenToday : 0);
  const remainingKcal = Math.round(budgetKcal - eaten);
  const balanceKcal = Math.round(eatenBefore - target * elapsed);

  let perDayKcal: number | null = null;
  let shortfall: WeekShortfall | null = null;
  if (daysLeft > 0) {
    const available = budgetKcal - eatenBefore;
    perDayKcal = Math.round(available / daysLeft);
    // Resten av veckan på golvet (idag minst det som redan ätits): går veckan ändå över
    // budgeten räcker den inte – förslaget blir golvet och resten föreslås till nästa vecka.
    const projected = eatenBefore + Math.max(eatenToday, floorKcal) + floorKcal * (daysLeft - 1);
    const over = Math.round(projected - budgetKcal);
    if (over > 0 || perDayKcal < floorKcal) {
      perDayKcal = floorKcal;
      shortfall = {
        exceeded: remainingKcal < 0,
        exceededKcal: Math.max(0, -remainingKcal),
        overKcal: Math.max(0, over),
        nextWeekPerDayKcal: Math.round(Math.max(0, over) / 7),
      };
    }
  }

  return {
    from,
    to,
    dailyTargetKcal: target,
    budgetKcal,
    eatenKcal: Math.round(eaten),
    remainingKcal,
    daysLeft,
    perDayKcal,
    balanceKcal,
    unloggedDays,
    floorKcal,
    shortfall,
    days,
  };
}

/** "Vecka: 6 200 av 14 000 kcal · kvar 7 800 kcal · ≈ 1 950 kcal/dag resten av veckan" */
export function weekRowText(week: WeekBudget): string {
  const used = `Vecka: ${formatInt(week.eatenKcal)} av ${formatKcal(week.budgetKcal)}`;
  const left =
    week.remainingKcal >= 0
      ? `kvar ${formatKcal(week.remainingKcal)}`
      : `över ${formatKcal(-week.remainingKcal)}`;
  if (week.perDayKcal === null) return `${used} · ${left}`;
  return `${used} · ${left} · ≈ ${formatInt(week.perDayKcal)} kcal/dag resten av veckan`;
}

/** Kort veckorad på Översikt: "Vecka: 10 132 kcal kvar · ≈ 1 804/dag" (resten i veckopanelen). */
export function weekRowShortText(week: WeekBudget): string {
  const left =
    week.remainingKcal >= 0
      ? `Vecka: ${formatKcal(week.remainingKcal)} kvar`
      : `Vecka: ${formatKcal(-week.remainingKcal)} över`;
  if (week.perDayKcal === null) return left;
  return `${left} · ≈ ${formatInt(week.perDayKcal)}/dag`;
}

/** "Saldo hittills +350 kcal" – loggat mot planerat för dagarna före idag. */
export function weekBalanceText(week: WeekBudget): string {
  return `${week.daysLeft > 0 ? 'Saldo hittills' : 'Saldo'} ${formatSignedKcal(week.balanceKcal)}`;
}
