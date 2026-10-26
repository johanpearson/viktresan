/**
 * Vad som händer när något användaren skapat tas bort – texterna i bekräftelsen (detaljvyns
 * "Ta bort …"). Borttagning ändrar aldrig loggar eller historik: loggposter, tagna doser,
 * besvarade pass och vikter har egna kopior av värdena. Rena funktioner utan I/O.
 */
import { formatInt } from './format.ts';
import { portionsText } from './recipes.ts';

/** "1 loggad post" / "3 loggade poster". */
export function loggedEntriesText(n: number): string {
  return n === 1 ? '1 loggad post' : `${formatInt(n)} loggade poster`;
}

/** Antal loggposter av ett livsmedel, en måltid eller ett recept. */
export function countLogged(log: readonly { foodId: string }[], foodId: string): number {
  return log.reduce((n, e) => (e.foodId === foodId ? n + 1 : n), 0);
}

function keptText(n: number, what: string): string {
  return n === 0
    ? `Du har inte loggat ${what} – inget i loggen påverkas.`
    : `${loggedEntriesText(n)} finns kvar i loggen med sina värden.`;
}

export function foodRemovalText(logged: number): string {
  return `Livsmedlet försvinner ur Egna, sökningen och snabbvalen. ${keptText(logged, 'det')} Måltider och recept med livsmedlet behåller det.`;
}

export function mealRemovalText(logged: number): string {
  return `Måltiden försvinner ur Egna, sökningen och snabbvalen. ${keptText(logged, 'den')}`;
}

/** `leftover` = portioner kvar i en pågående omgång matlådor (0 = ingen). */
export function recipeRemovalText(logged: number, leftover: number): string {
  const parts = [
    `Receptet försvinner ur Egna, sökningen och snabbvalen. ${
      logged === 0
        ? 'Du har inte loggat det – inget i loggen påverkas.'
        : `${loggedEntriesText(logged)} finns kvar – de har en egen kopia av receptet.`
    }`,
  ];
  if (leftover > 0) parts.push(`Matlådorna (${portionsText(leftover)} kvar) försvinner också.`);
  return parts.join(' ');
}

export function leftoverRemovalText(left: number): string {
  return `Matlådorna (${portionsText(left)} kvar) försvinner ur sök-sheeten. Receptet och det du redan loggat finns kvar.`;
}

export function quickLogRemovalText(): string {
  return 'Posten tas bort ur dagens logg och summor. Andra dagar och snabbvalet påverkas inte.';
}

export function supplementRemovalText(taken: number): string {
  return `Tillskottet försvinner ur Idag och Att göra. ${
    taken === 0
      ? 'Inga tagna doser är loggade.'
      : `${taken === 1 ? '1 tagen dos' : `${formatInt(taken)} tagna doser`} finns kvar i historiken och näringssummeringen.`
  }`;
}

export function unitRemovalText(): string {
  return 'Enheten försvinner ur enhetsvalet. Det du redan loggat behåller sin vikt.';
}

export function sessionRemovalText(photos: number): string {
  return `Tillfället och ${photos === 1 ? 'dess bild' : `dess ${formatInt(photos)} bilder`} tas bort från enheten. Vikter i viktloggen påverkas inte.`;
}

export function workoutRemovalText(): string {
  return 'Passet tas bort ur kalendern och statistiken. Andra pass och scheman påverkas inte.';
}

export function planRemovalText(): string {
  return 'Kommande planerade pass från schemat försvinner. Pass du redan besvarat (genomförda eller hoppade) ligger kvar.';
}

/** `target` = måltiden posterna flyttas till; `count` = poster i måltiden. */
export function mealSlotRemovalText(count: number, target: string | null): string {
  if (count === 0 || target === null) {
    return 'Måltiden försvinner ur Mat → Dag och måltidsvalen. Inga poster är loggade i den.';
  }
  return `Måltiden försvinner ur Mat → Dag. ${loggedEntriesText(count)} flyttas till ${target} – inget tas bort ur loggen.`;
}
