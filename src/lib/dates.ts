/**
 * Datumhjälpare för ISO-datum (`YYYY-MM-DD`). Alla beräkningar görs i UTC på
 * kalenderdagar så att sommartid inte ger dagar som är 23 eller 25 timmar långa.
 */

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dagens datum i användarens lokala tidszon. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Antal dagar sedan 1970-01-01 (heltal). */
export function toDayNumber(iso: string): number {
  if (!isIsoDate(iso)) throw new RangeError(`Ogiltigt datum: ${iso}`);
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

export function fromDayNumber(day: number): string {
  return new Date(Math.round(day) * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** Antal dagar från `from` till `to` (negativt om `to` ligger före). */
export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** Datum → sekunder (mitt på dagen i UTC), för uPlots tidsaxel. */
export function toChartSeconds(iso: string): number {
  return toDayNumber(iso) * 86_400 + 43_200;
}
