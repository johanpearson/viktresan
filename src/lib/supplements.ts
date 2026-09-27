/**
 * Kosttillskott: former, scheman, dagens tillskott och tagna doser. Rena funktioner
 * utan I/O (databasen ligger i db.ts).
 */
import type { NutrientKey } from '../data/nutrients.ts';
import type {
  Supplement,
  SupplementForm,
  SupplementIntake,
  SupplementNutrient,
  SupplementSchedule,
} from '../db/db.ts';
import { toDayNumber } from './dates.ts';
import { formatNutrient } from './format.ts';
import { nutrientInfo, toCanonical } from './nutrientUnits.ts';

export const SUPPLEMENT_FORMS: readonly { id: SupplementForm; one: string; many: string }[] = [
  { id: 'tablett', one: 'tablett', many: 'tabletter' },
  { id: 'kapsel', one: 'kapsel', many: 'kapslar' },
  { id: 'droppe', one: 'droppe', many: 'droppar' },
  { id: 'ml', one: 'ml', many: 'ml' },
  { id: 'brustablett', one: 'brustablett', many: 'brustabletter' },
];

export const SUPPLEMENT_SCHEDULES: readonly { id: SupplementSchedule; label: string }[] = [
  { id: 'dagligen', label: 'Dagligen' },
  { id: 'veckodagar', label: 'Vissa dagar' },
  { id: 'vid-behov', label: 'Vid behov' },
];

export const DOSES_PER_DAY_MAX = 6;

const WEEKDAY_SHORT = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];

const amountFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });

/** "1 tablett", "2 droppar", "5 ml". */
export function formatDoseAmount(form: SupplementForm, amount: number): string {
  const info = SUPPLEMENT_FORMS.find((f) => f.id === form);
  const word = amount === 1 ? (info?.one ?? form) : (info?.many ?? form);
  return `${amountFormat.format(amount)} ${word}`;
}

/** "Dagligen", "mån, ons, fre", "Vid behov" – med "2 gånger" om fler doser per dag. */
export function scheduleText(s: Pick<Supplement, 'schedule' | 'weekdays' | 'dosesPerDay'>): string {
  const base =
    s.schedule === 'veckodagar'
      ? (s.weekdays ?? []).map((d) => WEEKDAY_SHORT[d] ?? '').join(', ')
      : (SUPPLEMENT_SCHEDULES.find((o) => o.id === s.schedule)?.label ?? '');
  return s.dosesPerDay > 1 ? `${base} · ${String(s.dosesPerDay)} gånger` : base;
}

/** "Vitamin D 25 µg" – i angiven enhet. */
export function nutrientText(n: SupplementNutrient): string {
  return `${nutrientInfo(n.key).label} ${formatNutrient(n.amount, n.unit)}`;
}

/** Kort beskrivning för listor: "1 tablett · Dagligen · Vitamin D 25 µg". */
export function describeSupplement(s: Supplement): string {
  const nutrients = s.nutrients.slice(0, 2).map(nutrientText);
  if (s.nutrients.length > 2) nutrients.push(`+${String(s.nutrients.length - 2)}`);
  return [formatDoseAmount(s.form, s.amountPerDose), scheduleText(s), ...nutrients].join(' · ');
}

/** 0 = måndag … 6 = söndag (1970-01-01 var en torsdag). Samma som kalenderns. */
function weekdayIndex(iso: string): number {
  return (((toDayNumber(iso) + 3) % 7) + 7) % 7;
}

/** Ska tillskottet tas datumet? Vid behov är aldrig planerat. */
export function isScheduledOn(s: Supplement, date: string): boolean {
  if (s.schedule === 'dagligen') return true;
  if (s.schedule === 'veckodagar') return (s.weekdays ?? []).includes(weekdayIndex(date));
  return false;
}

export function intakeId(supplementId: string, date: string): string {
  return `${supplementId}:${date}`;
}

/** Dagens tagna doser av tillskottet: alla planerade doser, med namn och värden kopierade. */
export function intakeFor(s: Supplement, date: string, now = Date.now()): SupplementIntake {
  return {
    id: intakeId(s.id, date),
    date,
    supplementId: s.id,
    name: s.name,
    doses: s.dosesPerDay,
    nutrients: s.nutrients.map((n) => ({ ...n })),
    createdAt: now,
  };
}

export interface DaySupplement {
  supplement: Supplement;
  /** Planerat datumet (inte vid behov). */
  planned: boolean;
  intake: SupplementIntake | null;
}

/**
 * Tillskotten en dag: planerade först, sedan vid behov och sist de som tagits fast de
 * inte var planerade (t.ex. efter att schemat ändrats), i namnordning.
 */
export function supplementsOn(
  supplements: readonly Supplement[],
  log: readonly SupplementIntake[],
  date: string,
): DaySupplement[] {
  const items = supplements
    .map((supplement) => ({
      supplement,
      planned: isScheduledOn(supplement, date),
      intake: log.find((e) => e.id === intakeId(supplement.id, date)) ?? null,
    }))
    .filter((i) => i.planned || i.intake !== null || i.supplement.schedule === 'vid-behov');
  const rank = (i: DaySupplement) =>
    i.planned ? 0 : i.supplement.schedule === 'vid-behov' ? 1 : 2;
  return items.sort(
    (a, b) => rank(a) - rank(b) || a.supplement.name.localeCompare(b.supplement.name, 'sv'),
  );
}

/** Planerade tillskott datumet som inte tagits (det "Alla tagna" bockar av). */
export function untaken(items: readonly DaySupplement[]): Supplement[] {
  return items.filter((i) => i.planned && i.intake === null).map((i) => i.supplement);
}

/** Tagna och planerade tillskott en dag – kalendern och Översikt. */
export function supplementStatus(
  supplements: readonly Supplement[],
  log: readonly SupplementIntake[],
  date: string,
): { taken: number; planned: number } {
  const taken = log.filter((e) => e.date === date).length;
  // Bara tillskott som fanns då räknas som planerade.
  const planned = supplements.filter(
    (s) => isScheduledOn(s, date) && localDate(s.createdAt) <= date,
  ).length;
  return { taken, planned };
}

function localDate(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(d.getFullYear())}-${m}-${day}`;
}

/** Tagna mängder av ett tillskott i näringsämnenas egna enheter (doser × per dos). */
export function intakeAmounts(intake: SupplementIntake): Map<NutrientKey, number> {
  const amounts = new Map<NutrientKey, number>();
  for (const n of intake.nutrients) {
    const value = toCanonical(n.key, n.amount, n.unit);
    if (value === null) continue;
    amounts.set(n.key, (amounts.get(n.key) ?? 0) + value * intake.doses);
  }
  return amounts;
}
