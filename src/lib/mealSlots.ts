/**
 * Dagens måltider (Inställningar → Måltider): namn, ungefärlig tid och typ. Matloggposter
 * refererar en måltid med dess id, som är stabilt även om måltiden byter namn.
 * Rena funktioner utan I/O.
 */

/** Id för en måltid i `mealSlots` (standardmåltiderna har läsbara id:n, egna en uuid). */
export type MealId = string;

export type MealKind = 'huvudmal' | 'mellanmal';

export const MEAL_KIND_LABELS: Record<MealKind, string> = {
  huvudmal: 'Huvudmåltid',
  mellanmal: 'Mellanmål',
};

/** En måltid under dagen (sedan v15). */
export interface MealSlot {
  id: MealId;
  name: string;
  /** Ungefärlig tid, lokal "HH:MM". */
  time: string;
  kind: MealKind;
  /** Ordningen i listan (och i Mat → Dag), 0 först. */
  order: number;
  createdAt: number;
  updatedAt?: number;
}

/** Standardmåltiderna för nya användare (och efter migreringen v14 → v15). */
export const DEFAULT_MEAL_SLOTS: readonly Omit<MealSlot, 'createdAt'>[] = [
  { id: 'frukost', name: 'Frukost', time: '07:00', kind: 'huvudmal', order: 0 },
  { id: 'formiddag', name: 'Förmiddagsmellanmål', time: '10:00', kind: 'mellanmal', order: 1 },
  { id: 'lunch', name: 'Lunch', time: '12:00', kind: 'huvudmal', order: 2 },
  { id: 'eftermiddag', name: 'Eftermiddagsmellanmål', time: '15:00', kind: 'mellanmal', order: 3 },
  { id: 'middag', name: 'Middag', time: '18:00', kind: 'huvudmal', order: 4 },
  { id: 'kvall', name: 'Kvällsmål', time: '21:00', kind: 'mellanmal', order: 5 },
];

/** Mellanmålet som gamla Mellanmål-poster hamnar i när loggtiden inte avgör. */
export const FALLBACK_SNACK_ID: MealId = 'eftermiddag';

/** Den gamla fasta måltiden "Mellanmål" (före v15) – fördelas på mellanmålen efter loggtid. */
export const LEGACY_SNACK_ID = 'mellanmal';

/** De fasta måltiderna före v15 (säkerhetskopior version 1–11). */
export const LEGACY_MEAL_IDS: readonly string[] = ['frukost', 'lunch', 'middag', LEGACY_SNACK_ID];

export const MEAL_NAME_MAX = 40;

export function defaultMealSlots(now = 0): MealSlot[] {
  return DEFAULT_MEAL_SLOTS.map((m) => ({ ...m, createdAt: now }));
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isMealTime(value: unknown): value is string {
  return typeof value === 'string' && TIME.test(value);
}

/** "HH:MM" → minuter efter midnatt. */
export function minutesOf(time: string): number {
  const m = TIME.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Lokal tid på dygnet i minuter. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** I listans ordning. */
export function sortMealSlots(slots: readonly MealSlot[]): MealSlot[] {
  return [...slots].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** Måltidens namn, eller "Måltid" om den inte finns (borttagen). */
export function mealName(slots: readonly MealSlot[], id: MealId): string {
  return slots.find((s) => s.id === id)?.name ?? 'Måltid';
}

/** Avstånd mellan två klockslag runt dygnet (23:30 och 00:30 = 60 min). */
function clockDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

/** Måltiden vars tid ligger närmast klockslaget (lika nära → den tidigare i listan). */
export function nearestMeal(slots: readonly MealSlot[], minutes: number): MealSlot | null {
  let best: MealSlot | null = null;
  let bestDistance = Infinity;
  for (const slot of sortMealSlots(slots)) {
    const d = clockDistance(minutesOf(slot.time), minutes);
    if (d < bestDistance) {
      best = slot;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Pågående måltid: den vars tid ligger närmast före klockslaget (samma minut räknas). Före
 * dagens första måltid är det den första (frukosten), inte gårdagens sista.
 */
export function currentMeal(slots: readonly MealSlot[], now: Date = new Date()): MealSlot | null {
  const minutes = minutesOfDay(now);
  const byTime = [...slots].sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
  let current: MealSlot | null = byTime[0] ?? null;
  for (const slot of byTime) {
    if (minutesOf(slot.time) <= minutes) current = slot;
  }
  return current;
}

/** Id för pågående måltid, `null` om det inte finns några måltider. */
export function currentMealId(slots: readonly MealSlot[], now: Date = new Date()): MealId | null {
  return currentMeal(slots, now)?.id ?? null;
}

/**
 * Mellanmålet en gammal Mellanmål-post flyttas till: det vars tid ligger närmast postens
 * loggtid (`createdAt`, lokal tid), annars Eftermiddagsmellanmål, annars närmaste måltid.
 */
export function snackFor(slots: readonly MealSlot[], createdAt: number): MealId | null {
  const snacks = slots.filter((s) => s.kind === 'mellanmal');
  const when = new Date(createdAt);
  if (Number.isFinite(createdAt) && !Number.isNaN(when.getTime())) {
    const nearest = nearestMeal(snacks, minutesOfDay(when));
    if (nearest) return nearest.id;
  }
  if (slots.some((s) => s.id === FALLBACK_SNACK_ID)) return FALLBACK_SNACK_ID;
  return nearestMeal(slots, Number.isFinite(createdAt) ? minutesOfDay(when) : 0)?.id ?? null;
}

/**
 * Måltiden en post hör till bland `slots`: dess egen om den finns; gamla Mellanmål → närmaste
 * mellanmål efter loggtid; annars (borttagen eller okänd måltid) närmaste måltid efter loggtid.
 * Oförändrat id om det inte finns några måltider.
 */
export function resolveMealId(slots: readonly MealSlot[], meal: MealId, createdAt: number): MealId {
  if (slots.some((s) => s.id === meal)) return meal;
  if (meal === LEGACY_SNACK_ID) return snackFor(slots, createdAt) ?? meal;
  const when = new Date(createdAt);
  const minutes = Number.isNaN(when.getTime()) ? 0 : minutesOfDay(when);
  return nearestMeal(slots, minutes)?.id ?? meal;
}

/** Poster med en måltid som inte finns bland `slots` flyttas (se `resolveMealId`). Övriga oförändrade. */
export function resolveEntryMeals<T extends { meal: MealId; createdAt: number }>(
  entries: readonly T[],
  slots: readonly MealSlot[],
): T[] {
  return entries.map((e) => {
    const meal = resolveMealId(slots, e.meal, e.createdAt);
    return meal === e.meal ? e : { ...e, meal };
  });
}

/**
 * Poster i en måltid som tas bort flyttas till `targetId`. Returnerar bara de poster som ändras
 * (med `updatedAt`), så att de kan sparas.
 */
export function moveEntries<T extends { meal: MealId; updatedAt?: number }>(
  entries: readonly T[],
  fromId: MealId,
  targetId: MealId,
  now: number,
): T[] {
  return entries
    .filter((e) => e.meal === fromId)
    .map((e) => ({ ...e, meal: targetId, updatedAt: now }));
}

/**
 * Måltiderna i ordningen `ids` (t.ex. efter dra-och-släpp) med nytt `order` 0, 1, 2 …; de som byter
 * plats får `updatedAt`. Måltider som saknas i `ids` läggs sist i sin gamla ordning.
 */
export function applyMealOrder(
  slots: readonly MealSlot[],
  ids: readonly MealId[],
  now: number,
): MealSlot[] {
  const byId = new Map(slots.map((s) => [s.id, s]));
  const listed = ids.flatMap((id) => byId.get(id) ?? []);
  const rest = sortMealSlots(slots).filter((s) => !ids.includes(s.id));
  return [...listed, ...rest].map((s, order) =>
    s.order === order ? s : { ...s, order, updatedAt: now },
  );
}

/** Valideringsfel för en måltid i formuläret, eller `null`. */
export function mealSlotError(
  input: { name: string; time: string },
  others: readonly MealSlot[],
): string | null {
  const name = input.name.trim();
  if (name === '') return 'Skriv ett namn på måltiden.';
  if (name.length > MEAL_NAME_MAX) return `Namnet får vara högst ${String(MEAL_NAME_MAX)} tecken.`;
  if (others.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
    return 'Det finns redan en måltid med det namnet.';
  }
  if (!isMealTime(input.time)) return 'Ange en tid, t.ex. 15:00.';
  return null;
}

/**
 * Förvald måltid i logg-sheeten: postens (vid redigering) eller den valda (+ i en måltid),
 * annars pågående måltid efter klockslaget.
 */
export function initialMealId(
  slots: readonly MealSlot[],
  preferred: { meal: MealId; createdAt?: number } | null,
  now: Date = new Date(),
): MealId {
  if (preferred) return resolveMealId(slots, preferred.meal, preferred.createdAt ?? now.getTime());
  return currentMealId(slots, now) ?? '';
}
