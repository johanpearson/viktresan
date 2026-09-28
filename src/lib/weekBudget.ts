/**
 * Veckobudget för kalorier (Inställningar → Kalorimål → Per vecka). Veckan är
 * måndag–söndag och budgeten 7 × dagsmålet. Dagens förslag = det som är kvar av
 * budgeten före idag delat på dagarna som är kvar (idag till och med söndag). Rena
 * funktioner utan I/O.
 *
 * - Förslaget går aldrig under kalorigolvet. Räcker inte budgeten sägs det sakligt och
 *   överskottet föreslås fördelat över nästa vecka i stället.
 * - Tidigare dagar i veckan utan matlogg räknas som dagsmålet – annars skulle en
 *   ologgad dag se ut som en dag utan mat och ge för högt förslag.
 * - Förslaget räknas på dagarna före idag, så det står still under dagen.
 */
import type { CalorieMode } from '../db/db.ts';
import { addDays, toDayNumber } from './dates.ts';
import { mondayOf } from './weekSummary.ts';

export interface WeekBudgetInput {
  /** Dagsmålet (planens kalorimål). */
  dailyTargetKcal: number;
  floorKcal: number;
  /** Intag per loggad dag (dagar utan matlogg saknas). */
  intake: readonly { date: string; kcal: number }[];
  today: string;
}

export interface WeekShortfall {
  /** Det som skulle bli kvar per dag utan golvet. */
  perDayKcal: number;
  /** Det golvet lägger till jämfört med budgeten – föreslås fördelat över nästa vecka. */
  carryKcal: number;
  /** `carryKcal` fördelat över nästa veckas sju dagar. */
  nextWeekPerDayKcal: number;
}

export interface WeekBudget {
  /** Måndag. */
  from: string;
  /** Söndag. */
  to: string;
  budgetKcal: number;
  /** Loggat från måndag till och med idag. */
  eatenKcal: number;
  /** Tidigare dagar utan matlogg, räknade som dagsmålet. */
  assumedDays: number;
  assumedKcal: number;
  /** Budget − loggat − antagna dagar. Negativt = över budgeten. */
  remainingKcal: number;
  /** Dagar kvar i veckan, idag medräknad. */
  daysLeft: number;
  /** Dagens föreslagna mål (aldrig under golvet). */
  suggestedKcal: number;
  floorKcal: number;
  /** Satt när budgeten inte räcker till golvet resten av veckan. */
  shortfall: WeekShortfall | null;
}

export function weekBudget({
  dailyTargetKcal,
  floorKcal,
  intake,
  today,
}: WeekBudgetInput): WeekBudget {
  const from = mondayOf(today);
  const to = addDays(from, 6);
  const budgetKcal = Math.round(dailyTargetKcal) * 7;
  const byDate = new Map(intake.map((d) => [d.date, d.kcal]));

  let eatenBefore = 0;
  let assumedDays = 0;
  for (let date = from; date < today; date = addDays(date, 1)) {
    const kcal = byDate.get(date);
    if (kcal === undefined) assumedDays++;
    else eatenBefore += kcal;
  }
  const assumedKcal = assumedDays * Math.round(dailyTargetKcal);
  const eatenToday = byDate.get(today) ?? 0;
  const daysLeft = toDayNumber(to) - toDayNumber(today) + 1;
  const available = budgetKcal - eatenBefore - assumedKcal;
  const raw = available / daysLeft;

  let suggestedKcal = Math.round(raw);
  let shortfall: WeekShortfall | null = null;
  if (raw < floorKcal) {
    suggestedKcal = floorKcal;
    const carryKcal = Math.round(floorKcal * daysLeft - available);
    shortfall = {
      perDayKcal: Math.round(raw),
      carryKcal,
      nextWeekPerDayKcal: Math.round(carryKcal / 7),
    };
  }

  return {
    from,
    to,
    budgetKcal,
    eatenKcal: Math.round(eatenBefore + eatenToday),
    assumedDays,
    assumedKcal,
    remainingKcal: Math.round(available - eatenToday),
    daysLeft,
    suggestedKcal,
    floorKcal,
    shortfall,
  };
}

/**
 * Dagens mål i appen: veckoförslaget i veckoläge, annars dagsmålet. `null` utan
 * kalorimål (ofullständig profil).
 */
export function dayTarget(
  mode: CalorieMode | undefined,
  plan: { targetKcal: number; floorKcal: number } | null,
  intake: readonly { date: string; kcal: number }[],
  date: string,
): { targetKcal: number | null; week: WeekBudget | null } {
  if (!plan) return { targetKcal: null, week: null };
  if (mode !== 'vecka') return { targetKcal: plan.targetKcal, week: null };
  const week = weekBudget({
    dailyTargetKcal: plan.targetKcal,
    floorKcal: plan.floorKcal,
    intake,
    today: date,
  });
  return { targetKcal: week.suggestedKcal, week };
}
