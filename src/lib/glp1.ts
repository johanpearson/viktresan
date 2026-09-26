/**
 * GLP-1: schema, dostrappa, planerade och loggade doser, rotation av
 * injektionsställen och dosbyten. Rena funktioner – "nu" skickas in.
 *
 * Doserna kommer alltid från användarens egen dostrappa (förskrivarens
 * ordination). Appen räknar aldrig fram eller föreslår någon dos själv.
 */
import type { DoseStep, Injection, Medication } from '../db/db.ts';
import { addDays, toDayNumber, todayIso } from './dates.ts';
import { formatMg } from './format.ts';
import { WEEKDAYS } from './workouts.ts';

export type DoseFrequency = 'vecka' | 'dag';

export type InjectionSite =
  'buk-vanster' | 'buk-hoger' | 'lar-vanster' | 'lar-hoger' | 'overarm-vanster' | 'overarm-hoger';

/** Förvalda läkemedel. Andra namn skrivs in som fritext. */
export const PRESET_MEDICATIONS: readonly string[] = ['Wegovy', 'Ozempic', 'Mounjaro', 'Saxenda'];

export const DOSE_FREQUENCIES: readonly { id: DoseFrequency; label: string }[] = [
  { id: 'vecka', label: 'Veckovis' },
  { id: 'dag', label: 'Dagligen' },
];

/** Injektionsställen i rotationsordning. */
export const INJECTION_SITES: readonly { id: InjectionSite; label: string }[] = [
  { id: 'buk-vanster', label: 'Buk vänster' },
  { id: 'buk-hoger', label: 'Buk höger' },
  { id: 'lar-vanster', label: 'Lår vänster' },
  { id: 'lar-hoger', label: 'Lår höger' },
  { id: 'overarm-vanster', label: 'Överarm vänster' },
  { id: 'overarm-hoger', label: 'Överarm höger' },
];

/** Förvalda biverkningar. Annat skrivs in som fritext. */
export const SIDE_EFFECTS: readonly string[] = [
  'Illamående',
  'Kräkning',
  'Diarré',
  'Förstoppning',
  'Magont',
  'Halsbränna',
  'Trötthet',
  'Huvudvärk',
  'Yrsel',
];

export const APPETITE_MIN = 1;
export const APPETITE_MAX = 5;

/** Visas där doser läggs in. */
export const PRESCRIBER_NOTE =
  'Doser och dostrappa bestäms av den som förskrivit läkemedlet. Appen föreslår aldrig doser – lägg in det du fått ordinerat.';

/** En veckodos räknas som tagen om den loggas upp till så här många dagar före eller efter. */
export const WEEKLY_WINDOW_DAYS = 3;
/** Hur långt framåt "Nästa dos" letar. */
export const NEXT_DOSE_HORIZON_DAYS = 60;

export function siteLabel(id: InjectionSite): string {
  return INJECTION_SITES.find((s) => s.id === id)?.label ?? id;
}

export function isInjectionSite(value: unknown): value is InjectionSite {
  return INJECTION_SITES.some((s) => s.id === value);
}

/** 0 = måndag … 6 = söndag. */
function weekday(iso: string): number {
  return (((toDayNumber(iso) + 3) % 7) + 7) % 7;
}

/** Första dagen i schemat = dostrappans första steg. */
export function medicationStart(med: Pick<Medication, 'steps'>): string | null {
  return med.steps[0]?.date ?? null;
}

/** Det steg i trappan som gäller ett datum (senaste steget på eller före datumet). */
export function doseStepOn(steps: readonly DoseStep[], date: string): DoseStep | null {
  let current: DoseStep | null = null;
  for (const step of steps) {
    if (step.date <= date && (current === null || step.date >= current.date)) current = step;
  }
  return current;
}

/** Dosen enligt trappan ett datum, eller null före första steget. */
export function doseOn(med: Pick<Medication, 'steps'>, date: string): number | null {
  return doseStepOn(med.steps, date)?.doseMg ?? null;
}

/** Nästa steg i trappan efter datumet (för "Nästa steg: 0,5 mg från 1 okt."). */
export function nextDoseStep(med: Pick<Medication, 'steps'>, date: string): DoseStep | null {
  return med.steps.find((s) => s.date > date) ?? null;
}

/** Är läkemedlet aktivt ett datum (ej avslutat)? Framtida starter räknas som aktiva. */
export function isActive(med: Pick<Medication, 'endDate'>, date: string): boolean {
  return med.endDate == null || med.endDate >= date;
}

/** Datum i [from, to] då schemat har en dos. */
export function scheduleDates(med: Medication, from: string, to: string): string[] {
  const start = medicationStart(med);
  if (start === null) return [];
  const first = start > from ? start : from;
  const last = med.endDate != null && med.endDate < to ? med.endDate : to;
  const dates: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (med.frequency === 'dag' || weekday(day) === med.weekday) dates.push(day);
  }
  return dates;
}

/** Hur många dagar före/efter schemadagen en loggad dos räknas. */
function windowDays(med: Medication): number {
  return med.frequency === 'vecka' ? WEEKLY_WINDOW_DAYS : 0;
}

/**
 * Är schemadosen tagen? En injektion av läkemedlet samma dag – eller för veckodoser
 * inom ±3 dagar – räknas. Fönstren för två veckodoser överlappar aldrig.
 */
export function isCovered(
  med: Medication,
  date: string,
  injections: readonly Injection[],
): boolean {
  const w = windowDays(med);
  const from = addDays(date, -w);
  const to = addDays(date, w);
  return injections.some((i) => i.medicationId === med.id && i.date >= from && i.date <= to);
}

export type DoseStatus = 'loggad' | 'planerad';

/** En dos i en vy: loggad injektion eller planerad schemados. */
export interface DoseItem {
  date: string;
  time?: string;
  medicationId: string;
  medicationName: string;
  /** Planerad dos utanför trappan (före första steget) saknar dos. */
  doseMg: number | null;
  status: DoseStatus;
  injection?: Injection;
}

function compareDoses(a: DoseItem, b: DoseItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.time ?? '99:99';
  const tb = b.time ?? '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.medicationName.localeCompare(b.medicationName, 'sv');
}

function injectionItem(i: Injection): DoseItem {
  const item: DoseItem = {
    date: i.date,
    medicationId: i.medicationId,
    medicationName: i.medicationName,
    doseMg: i.doseMg,
    status: 'loggad',
    injection: i,
  };
  if (i.time !== undefined) item.time = i.time;
  return item;
}

function plannedItem(med: Medication, date: string): DoseItem {
  return {
    date,
    time: med.time,
    medicationId: med.id,
    medicationName: med.name,
    doseMg: doseOn(med, date),
    status: 'planerad',
  };
}

/**
 * Loggade injektioner i [from, to] och planerade doser som inte tagits än. Planerade
 * doser visas från och med idag – missade dagar bakåt fyller inte kalendern.
 */
export function dosesBetween(
  medications: readonly Medication[],
  injections: readonly Injection[],
  from: string,
  to: string,
  today: string,
): DoseItem[] {
  const items = injections.filter((i) => i.date >= from && i.date <= to).map(injectionItem);
  const plannedFrom = from > today ? from : today;
  for (const med of medications) {
    for (const date of scheduleDates(med, plannedFrom, to)) {
      if (!isCovered(med, date, injections)) items.push(plannedItem(med, date));
    }
  }
  return items.sort(compareDoses);
}

/** Nästa dos som inte tagits, från och med idag. */
export function nextDose(
  medications: readonly Medication[],
  injections: readonly Injection[],
  now: Date,
): DoseItem | null {
  const today = todayIso(now);
  const planned = dosesBetween(
    medications,
    injections,
    today,
    addDays(today, NEXT_DOSE_HORIZON_DAYS),
    today,
  ).filter((d) => d.status === 'planerad');
  return planned[0] ?? null;
}

/** Idag är dosdag och dosen är inte loggad: de doser som ska påminnas om. */
export function dueToday(
  medications: readonly Medication[],
  injections: readonly Injection[],
  now: Date,
): DoseItem[] {
  const today = todayIso(now);
  return dosesBetween(medications, injections, today, today, today).filter(
    (d) => d.status === 'planerad',
  );
}

/** Förifylld dos för ett datum: trappan, annars den senast loggade dosen av läkemedlet. */
export function suggestedDose(
  med: Medication,
  injections: readonly Injection[],
  date: string,
): number | null {
  const fromLadder = doseOn(med, date);
  if (fromLadder !== null) return fromLadder;
  const own = injections.filter((i) => i.medicationId === med.id && i.date <= date);
  return own.at(-1)?.doseMg ?? null;
}

function compareInjections(a: Injection, b: Injection): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.time ?? '';
  const tb = b.time ?? '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.createdAt - b.createdAt;
}

/**
 * Förslag på nästa injektionsställe: ett ställe som aldrig använts (i
 * rotationsordning), annars det som använts längst tillbaka. Följer man förslagen
 * blir det en jämn rotation buk → lår → överarm, vänster och höger.
 */
export function suggestSite(injections: readonly Injection[]): InjectionSite {
  const lastUse = new Map<InjectionSite, number>();
  [...injections].sort(compareInjections).forEach((i, order) => {
    if (i.site) lastUse.set(i.site, order);
  });
  let best: InjectionSite = INJECTION_SITES[0]?.id ?? 'buk-vanster';
  let bestOrder = Infinity;
  for (const { id } of INJECTION_SITES) {
    const order = lastUse.get(id) ?? -1;
    if (order < bestOrder) {
      best = id;
      bestOrder = order;
    }
  }
  return best;
}

/** Senast loggade injektion, eller null. */
export function lastInjection(injections: readonly Injection[]): Injection | null {
  return [...injections].sort(compareInjections).at(-1) ?? null;
}

export interface DoseChange {
  date: string;
  medicationName: string;
  doseMg: number;
  /** Första dosen (start) eller ett byte av dos/läkemedel. */
  kind: 'start' | 'byte';
}

/** Datum då den loggade dosen (eller läkemedlet) ändrades, äldst först. */
export function doseChanges(injections: readonly Injection[]): DoseChange[] {
  const changes: DoseChange[] = [];
  let previous: Injection | null = null;
  for (const i of [...injections].sort(compareInjections)) {
    if (
      previous === null ||
      previous.doseMg !== i.doseMg ||
      previous.medicationName !== i.medicationName
    ) {
      changes.push({
        date: i.date,
        medicationName: i.medicationName,
        doseMg: i.doseMg,
        kind: previous === null ? 'start' : 'byte',
      });
    }
    previous = i;
  }
  return changes;
}

/** "Wegovy 0,5 mg". */
export function describeDose(d: { medicationName: string; doseMg: number | null }): string {
  return d.doseMg == null ? d.medicationName : `${d.medicationName} ${formatMg(d.doseMg)}`;
}

/** "Varje måndag 08:00" / "Varje dag 08:00". */
export function describeSchedule(med: Pick<Medication, 'frequency' | 'weekday' | 'time'>): string {
  if (med.frequency === 'dag') return `Varje dag ${med.time}`;
  const day = WEEKDAYS[med.weekday ?? 0]?.[1] ?? '';
  return `Varje ${day} ${med.time}`;
}

/** Aptit som text: "3 av 5". */
export function describeAppetite(appetite: number): string {
  return `${String(appetite)} av ${String(APPETITE_MAX)}`;
}
