/**
 * Milstolpar: regler, utvärdering, "nästa på tur" och texter. Rena funktioner utan I/O –
 * allt som behövs skickas in, inklusive "idag".
 *
 * Viktmilstolparna mäts på trendvikten (EMA), inte på dagsvikten, så att en tillfällig dipp
 * (vätska, salt) inte ger en milstolpe som sedan "tas tillbaka". En milstolpe som en gång
 * nåtts sparas och ligger kvar (se `milestoneSync.ts`).
 */
import { addDays, daysBetween } from './dates.ts';
import type { FeatureGated } from './features.ts';
import { formatInt, formatKg } from './format.ts';
import { dailyIntake, type DatedPortion } from './nutrition.ts';
import { proteinGoalFor } from './protein.ts';
import {
  bmi,
  dailyWeights,
  emaTrend,
  roundKg,
  type DatedWeight,
  type TrendPoint,
} from './stats.ts';
import {
  dailyWater,
  drinkEntries,
  waterGoalFor,
  type DatedWater,
  type DrinkFoodEntry,
} from './water.ts';

export type MilestoneGroup = 'vikt' | 'vanor' | 'bilder';

/** Stora firas med helskärmsöverlägg, små med en diskret toast. */
export type MilestoneSize = 'stor' | 'liten';

/** Vad firandet erbjuder att göra härnäst. */
export type MilestoneAction = 'nytt-mal' | 'jamfor-bilder';

export interface Milestone extends FeatureGated {
  id: string;
  group: MilestoneGroup;
  size: MilestoneSize;
  /** Stor siffra eller symbol i firandet och listan, t.ex. "5 kg". */
  badge: string;
  title: string;
  /** Högre = viktigare. Styr vilken som firas när flera nås samtidigt. */
  rank: number;
  action?: MilestoneAction;
}

export interface MilestoneInput {
  profile: {
    startWeightKg: number;
    heightCm: number;
    goalWeightKg: number;
    proteinFactor?: number;
    sex?: 'man' | 'kvinna' | undefined;
    waterGoalMl?: number;
    waterTrainingBonus?: boolean;
  } | null;
  weights: readonly DatedWeight[];
  waist: readonly { date: string }[];
  steps: readonly { date: string }[];
  /** Matloggen; drycker i den räknas in i dryckesmålet. */
  foodLog: readonly (DatedPortion & DrinkFoodEntry)[];
  water: readonly DatedWater[];
  workouts: readonly { date: string; status: string }[];
  /** Datum för varje progressbild. */
  photoDates: readonly string[];
}

/** En milstolpe med läget just nu: när den nåddes (eller `null`) och hur långt kvar. */
export interface MilestoneCandidate {
  milestone: Milestone;
  /** Dagen milstolpen nåddes, `null` om den inte nåtts. */
  date: string | null;
  /** Andel av vägen dit, 0–1. */
  progress: number;
  /** "1,2 kg kvar", "3 dagar kvar" … */
  remaining: string;
  /** Visas bland kommande. Stegmilstolpar (var 5:e kg) visas bara närmast på tur. */
  upcoming: boolean;
}

export interface ReachedMilestone {
  milestone: Milestone;
  date: string;
}

/** Dagar med loggning totalt (inte i rad). */
export const LOGGED_DAY_STEPS: readonly number[] = [7, 30, 100];
/** Genomförda pass. 1 = första passet. */
export const WORKOUT_STEPS: readonly number[] = [1, 10, 50];
/** Dagar totalt med nått vatten- respektive proteinmål. */
export const GOAL_DAYS = 7;
/** Dagar efter den första bilden innan jämförelsebilden räknas. */
export const PHOTO_COMPARE_DAYS = 30;
/** Nedgång i procent av startvikten. */
export const PERCENT_STEPS: readonly number[] = [5, 10];
/** Viktnedgång i kg: första kilot, sedan var 5:e kg. */
export const KG_STEP = 5;
/** BMI-gränser (WHO) nedåt: under 30 = övervikt, under 25 = normalvikt. Aldrig undervikt. */
const BMI_STEPS: readonly { limit: number; slug: string; label: string }[] = [
  { limit: 30, slug: 'overvikt', label: 'Övervikt' },
  { limit: 25, slug: 'normalvikt', label: 'Normalvikt' },
];
/** Lägsta vikt som en kg-milstolpe kan gälla (samma som validering av vikter). */
const MIN_WEIGHT_KG = 20;

function goalSlug(goalKg: number): string {
  return String(roundKg(goalKg));
}

/**
 * Milstolpen för ett id, t.ex. `kg-5`, `mal-72.5` eller `bild-30`. `null` för okända id:n
 * (t.ex. från en nyare version av appen).
 */
export function describeMilestone(id: string): Milestone | null {
  const match = /^([a-z]+)-([a-z0-9.]+)$/.exec(id);
  if (!match) return null;
  const [, kind = '', arg = ''] = match;
  const n = Number(arg);
  switch (kind) {
    case 'kg':
      if (!Number.isInteger(n) || n < 1 || (n !== 1 && n % KG_STEP !== 0)) return null;
      return n === 1
        ? { id, group: 'vikt', size: 'liten', badge: '1 kg', title: 'Första kilot', rank: 30 }
        : {
            id,
            group: 'vikt',
            size: 'stor',
            badge: `${String(n)} kg`,
            title: `${String(n)} kg lättare`,
            rank: 60 + n / 100,
          };
    case 'procent':
      if (!PERCENT_STEPS.includes(n)) return null;
      return {
        id,
        group: 'vikt',
        size: n >= 10 ? 'stor' : 'liten',
        badge: `${String(n)} %`,
        title: `${String(n)} % av startvikten`,
        rank: n >= 10 ? 70 : 40,
      };
    case 'bmi': {
      const step = BMI_STEPS.find((b) => b.slug === arg);
      if (!step) return null;
      return {
        id,
        group: 'vikt',
        size: 'liten',
        badge: `BMI < ${String(step.limit)}`,
        title: `Ny BMI-kategori: ${step.label}`,
        rank: 45,
      };
    }
    case 'halvvags':
      if (!(n > 0)) return null;
      return {
        id,
        group: 'vikt',
        size: 'stor',
        badge: '½',
        title: 'Halvvägs till målet',
        rank: 80,
      };
    case 'mal':
      if (!(n > 0)) return null;
      return {
        id,
        group: 'vikt',
        size: 'stor',
        badge: '🏁',
        title: `Målet nått: ${formatKg(n)}`,
        rank: 100,
        action: 'nytt-mal',
      };
    case 'dagar':
      if (!LOGGED_DAY_STEPS.includes(n)) return null;
      return {
        id,
        group: 'vanor',
        size: 'liten',
        badge: String(n),
        title: `${String(n)} loggade dagar`,
        rank: 20 + n / 1000,
      };
    case 'pass':
      if (!WORKOUT_STEPS.includes(n)) return null;
      return {
        id,
        group: 'vanor',
        size: 'liten',
        badge: n === 1 ? '1:a' : String(n),
        title: n === 1 ? 'Första passet' : `${String(n)} genomförda pass`,
        rank: 20 + n / 1000,
        feature: 'traning',
      };
    case 'vatten':
      if (n !== GOAL_DAYS) return null;
      return {
        id,
        group: 'vanor',
        size: 'liten',
        badge: '💧',
        title: `Dryckesmålet nått ${String(n)} dagar`,
        rank: 15,
        feature: 'vatten',
      };
    case 'protein':
      if (n !== GOAL_DAYS) return null;
      return {
        id,
        group: 'vanor',
        size: 'liten',
        badge: '💪',
        title: `Proteinmålet nått ${String(n)} dagar`,
        rank: 15,
        feature: 'mat',
      };
    case 'bild':
      if (n === 1) {
        return {
          id,
          group: 'bilder',
          size: 'liten',
          badge: '📷',
          title: 'Första progressbilden',
          rank: 10,
          feature: 'bilder',
        };
      }
      if (n === PHOTO_COMPARE_DAYS) {
        return {
          id,
          group: 'bilder',
          size: 'liten',
          badge: '📷',
          title: `En ny bild ${String(n)} dagar senare`,
          rank: 12,
          feature: 'bilder',
          action: 'jamfor-bilder',
        };
      }
      return null;
    default:
      return null;
  }
}

function known(id: string): Milestone {
  const milestone = describeMilestone(id);
  if (!milestone) throw new Error(`Okänd milstolpe: ${id}`);
  return milestone;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function daysText(n: number): string {
  return n === 1 ? '1 dag' : `${formatInt(n)} dagar`;
}

/** Första trendpunkten som uppfyller villkoret. */
function firstTrend(trend: readonly TrendPoint[], test: (kg: number) => boolean): string | null {
  return trend.find((p) => test(p.trendKg))?.date ?? null;
}

/** Datumet då räkningen nådde `n` (datumen sorterade, ett per dag), annars null. */
function nthDate(sortedDates: readonly string[], n: number): string | null {
  return sortedDates[n - 1] ?? null;
}

function uniqueSorted(dates: Iterable<string>): string[] {
  return [...new Set(dates)].sort();
}

/**
 * Alla milstolpar som gäller för datan, med läget för var och en. Vikt kräver profil
 * (startvikten); halvvägs och mål kräver att målvikten ligger under startvikten.
 */
export function evaluateMilestones(input: MilestoneInput, today: string): MilestoneCandidate[] {
  const result: MilestoneCandidate[] = [];
  const upToToday = <T extends { date: string }>(items: readonly T[]) =>
    items.filter((i) => i.date <= today);
  const { profile } = input;
  const trend = emaTrend(dailyWeights(upToToday(input.weights)));

  if (profile) {
    const start = profile.startWeightKg;
    const current = trend.at(-1)?.trendKg ?? start;
    const goal = profile.goalWeightKg;
    const losing = goal < start;

    /** Milstolpe vid en tröskel i kg (trendvikten på eller under). */
    const weightCandidate = (id: string, thresholdKg: number, upcoming = true) => {
      const date = firstTrend(trend, (kg) => roundKg(kg) <= roundKg(thresholdKg));
      result.push({
        milestone: known(id),
        date,
        progress: clamp01((start - current) / (start - thresholdKg)),
        remaining: `${formatKg(Math.max(0.1, current - thresholdKg))} kvar`,
        upcoming,
      });
    };

    /** Visas bland kommande bara om tröskeln ligger på eller över målvikten. */
    const beforeGoal = (thresholdKg: number) => losing && roundKg(thresholdKg) >= roundKg(goal);

    // Första kilot, sedan var 5:e kg. Utöver de nådda tas bara nästa steg med.
    let nextKgIncluded = false;
    const kgSteps = [1];
    for (let kg = KG_STEP; start - kg >= MIN_WEIGHT_KG; kg += KG_STEP) kgSteps.push(kg);
    for (const kg of kgSteps) {
      const threshold = start - kg;
      const reached = firstTrend(trend, (t) => roundKg(t) <= roundKg(threshold)) !== null;
      if (!reached && nextKgIncluded) continue;
      if (!reached) nextKgIncluded = true;
      weightCandidate(`kg-${String(kg)}`, threshold, !reached && beforeGoal(threshold));
    }

    for (const pct of PERCENT_STEPS) {
      const threshold = start * (1 - pct / 100);
      weightCandidate(`procent-${String(pct)}`, threshold, beforeGoal(threshold));
    }

    const startBmi = bmi(start, profile.heightCm);
    if (startBmi != null) {
      const m2 = (profile.heightCm / 100) ** 2;
      for (const step of BMI_STEPS) {
        if (startBmi < step.limit) continue;
        const date = firstTrend(
          trend,
          (kg) => (bmi(kg, profile.heightCm) ?? Infinity) < step.limit,
        );
        const threshold = step.limit * m2;
        result.push({
          milestone: known(`bmi-${step.slug}`),
          date,
          progress: clamp01((start - current) / (start - threshold)),
          remaining: `${formatKg(Math.max(0.1, current - threshold))} kvar`,
          upcoming: beforeGoal(threshold),
        });
      }
    }

    if (losing) {
      const slug = goalSlug(goal);
      weightCandidate(`halvvags-${slug}`, start - (start - goal) / 2);
      weightCandidate(`mal-${slug}`, goal);
    }
  }

  // Loggade dagar totalt: vikt, midja, steg, mat, vatten och genomförda pass.
  const doneWorkouts = upToToday(input.workouts)
    .filter((w) => w.status === 'genomford')
    .map((w) => w.date)
    .sort();
  const loggedDays = uniqueSorted(
    [
      ...input.weights,
      ...input.waist,
      ...input.steps,
      ...input.foodLog,
      ...input.water,
      ...doneWorkouts.map((date) => ({ date })),
    ]
      .map((e) => e.date)
      .filter((d) => d <= today),
  );
  for (const n of LOGGED_DAY_STEPS) {
    result.push({
      milestone: known(`dagar-${String(n)}`),
      date: nthDate(loggedDays, n),
      progress: clamp01(loggedDays.length / n),
      remaining: `${daysText(Math.max(0, n - loggedDays.length))} kvar`,
      upcoming: true,
    });
  }

  for (const n of WORKOUT_STEPS) {
    const left = Math.max(0, n - doneWorkouts.length);
    result.push({
      milestone: known(`pass-${String(n)}`),
      date: nthDate(doneWorkouts, n),
      progress: clamp01(doneWorkouts.length / n),
      remaining: left === 1 ? '1 pass kvar' : `${formatInt(left)} pass kvar`,
      upcoming: true,
    });
  }

  if (profile) {
    // Dryckesmålet den dagen (med ev. träningstillägg); drycker ur matloggen räknas in.
    const goalOn = waterGoalFor({ profile, workouts: input.workouts });
    const waterDays = dailyWater(upToToday(drinkEntries(input.water, input.foodLog)))
      .filter((d) => d.ml >= goalOn(d.date))
      .map((d) => d.date);
    result.push(countCandidate(`vatten-${String(GOAL_DAYS)}`, waterDays, GOAL_DAYS));

    const proteinGoal = proteinGoalFor(profile);
    if (proteinGoal != null) {
      const proteinDays = dailyIntake(upToToday(input.foodLog))
        .filter((d) => Math.round(d.proteinG) >= proteinGoal)
        .map((d) => d.date);
      result.push(countCandidate(`protein-${String(GOAL_DAYS)}`, proteinDays, GOAL_DAYS));
    }
  }

  const photoDates = uniqueSorted(input.photoDates.filter((d) => d <= today));
  const firstPhoto = photoDates[0] ?? null;
  result.push({
    milestone: known('bild-1'),
    date: firstPhoto,
    progress: 0,
    remaining: 'Ta din första bild',
    upcoming: true,
  });
  const compareFrom = firstPhoto ? addDays(firstPhoto, PHOTO_COMPARE_DAYS) : null;
  const waitDays = compareFrom ? daysBetween(today, compareFrom) : null;
  result.push({
    milestone: known(`bild-${String(PHOTO_COMPARE_DAYS)}`),
    date: compareFrom ? (photoDates.find((d) => d >= compareFrom) ?? null) : null,
    progress: firstPhoto ? clamp01(daysBetween(firstPhoto, today) / PHOTO_COMPARE_DAYS) : 0,
    remaining:
      waitDays == null
        ? 'Efter din första bild'
        : waitDays > 0
          ? `Ta en ny bild om ${daysText(waitDays)}`
          : 'Ta en ny bild nu',
    upcoming: true,
  });

  return result;
}

function countCandidate(id: string, dates: readonly string[], n: number): MilestoneCandidate {
  return {
    milestone: known(id),
    date: nthDate(dates, n),
    progress: clamp01(dates.length / n),
    remaining: `${daysText(Math.max(0, n - dates.length))} kvar`,
    upcoming: true,
  };
}

/** Nådda milstolpar enligt datan, äldst först. */
export function reachedMilestones(candidates: readonly MilestoneCandidate[]): ReachedMilestone[] {
  return candidates
    .filter((c): c is MilestoneCandidate & { date: string } => c.date !== null)
    .map((c) => ({ milestone: c.milestone, date: c.date }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * De `count` närmaste kommande milstolparna: inte nådda, inte sparade, sorterade på hur
 * stor del av vägen som är avklarad (högst först).
 */
export function upcomingMilestones(
  candidates: readonly MilestoneCandidate[],
  stored: ReadonlySet<string>,
  count = 3,
): MilestoneCandidate[] {
  return candidates
    .filter((c) => c.upcoming && c.date === null && !stored.has(c.milestone.id))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.progress - a.c.progress || a.i - b.i)
    .slice(0, count)
    .map(({ c }) => c);
}

/** Nyligen nådda firas; äldre (t.ex. inlagda i efterhand) sparas bara. */
export const CELEBRATE_WITHIN_DAYS = 7;

export type SyncMode = 'live' | 'silent';

export interface MilestoneDiff {
  /** Nådda men inte sparade – ska sparas. */
  added: ReachedMilestone[];
  /** Delmängd av `added` som ska firas, viktigast först. */
  celebrate: ReachedMilestone[];
}

/**
 * Jämför nådda milstolpar med de sparade. Varje milstolpe sparas en gång. `silent`
 * (appstart, import) sparar utan firande – redan passerade milstolpar firas aldrig i klump.
 * `live` (efter en sparning) firar de nyss nådda: aktiverad funktion och nådd inom
 * `CELEBRATE_WITHIN_DAYS`.
 */
export function diffMilestones(
  reached: readonly ReachedMilestone[],
  stored: ReadonlySet<string>,
  {
    mode,
    today,
    isEnabled = () => true,
  }: { mode: SyncMode; today: string; isEnabled?: (m: Milestone) => boolean },
): MilestoneDiff {
  const added = reached.filter((r) => !stored.has(r.milestone.id));
  if (mode === 'silent') return { added, celebrate: [] };
  const from = addDays(today, -(CELEBRATE_WITHIN_DAYS - 1));
  const celebrate = added
    .filter((r) => r.date >= from && isEnabled(r.milestone))
    .sort((a, b) => b.milestone.rank - a.milestone.rank);
  return { added, celebrate };
}

// ---------------------------------------------------------------------------
// Texter. Varma och personliga, men inte överdrivna.

function kgComparison(kg: number): string {
  if (kg === 5) return 'Det är ungefär tio paket smör à 500 g.';
  if (kg === 10) return 'Det är som en fylld tiolitershink vatten.';
  if (kg === 15) return 'Det är ungefär lika mycket som en packad resväska.';
  return `Det är lika mycket som ${formatInt(kg)} literpaket mjölk.`;
}

/** Varianter av meddelandet för en milstolpe. */
export function milestoneMessages(milestone: Milestone): string[] {
  const [kind = '', arg = ''] = milestone.id.split('-');
  const n = Number(arg);
  switch (kind) {
    case 'kg':
      if (n === 1) {
        return [
          'Första kilot är borta – ungefär som en liter mjölk. Starten är gjord!',
          'Trenden visar ett kilo mindre. Små steg blir stora över tid.',
          'Ett kilo på trenden, inte bara en bra dag på vågen. Fint!',
        ];
      }
      return [
        `${String(n)} kg lättare på trendvikten. ${kgComparison(n)}`,
        `Du har tagit dig ${String(n)} kg närmare. ${kgComparison(n)} Tänk på allt arbete bakom det.`,
        `${String(n)} kg – och det är trenden, så det håller. ${kgComparison(n)}`,
      ];
    case 'procent':
      return n >= 10
        ? [
            'Tio procent av startvikten! Det är en nivå som ofta märks på hälsan – blodtryck, sömn och ork.',
            'Du har gått ner 10 % av där du började. Det är stort, på riktigt.',
          ]
        : [
            'Fem procent av startvikten – redan där gör kroppen ofta märkbara vinster.',
            '5 % ner från start. Stadigt och fint jobbat.',
          ];
    case 'bmi':
      return [
        'Trendvikten har tagit dig in i en ny BMI-kategori. Ett tydligt tecken på att det går åt rätt håll.',
        'Nytt BMI-intervall! Siffran är bara en del av bilden, men riktningen är din förtjänst.',
      ];
    case 'halvvags':
      return [
        'Halvvägs! Lika långt kvar som du redan gått – och nu vet du att du klarar det.',
        'Hälften av resan är gjord. Ta en stund och känn efter hur långt du har kommit.',
      ];
    case 'mal':
      return [
        'Du har nått din målvikt. Det här har du byggt dag för dag – grattis!',
        'Målet är nått! Nu kan du välja: ett nytt mål eller att hålla vikten.',
      ];
    case 'dagar':
      return n >= 100
        ? [
            '100 dagar med loggning. Det är en vana nu – och vanor är det som håller.',
            'Hundra loggade dagar! Den här sortens uthållighet är ovanlig.',
          ]
        : n >= 30
          ? [
              '30 dagar med loggning. En hel månads underlag – nu blir trenderna riktigt pålitliga.',
              'Trettio loggade dagar! Du ser din egen utveckling tydligare för varje dag.',
            ]
          : [
              'En veckas loggning! Varje dag du loggar gör trenden säkrare.',
              'Sju loggade dagar – en bra början på en vana.',
            ];
    case 'pass':
      return n === 1
        ? ['Första passet är klart. Bra att du kom i gång!', 'Första passet avbockat – snyggt.']
        : n >= 50
          ? [
              '50 pass! Det är många timmar du gett dig själv.',
              'Femtio genomförda pass. Träning har blivit en del av vardagen.',
            ]
          : [
              'Tio genomförda pass. Kroppen tackar för varje ett.',
              '10 pass! Nu börjar det bli en rutin.',
            ];
    case 'vatten':
      return [
        'Dryckesmålet nått sju dagar. Kroppen gillar det här.',
        'Sju dagar med nått dryckesmål – enkel vana, stor skillnad.',
      ];
    case 'protein':
      return [
        'Proteinmålet nått sju dagar. Det hjälper dig att behålla musklerna medan vikten går ner.',
        'Sju dagar med nått proteinmål – bra för både mättnad och muskler.',
      ];
    case 'bild':
      return n === 1
        ? [
            'Din första progressbild är sparad. Om några veckor blir den guld värd.',
            'Första bilden tagen. Den stannar på enheten och väntar på att jämföras.',
          ]
        : [
            'En månad mellan bilderna – dags att jämföra! Ibland syns det som vågen missar.',
            'Nu har du bilder med en månads mellanrum. Öppna jämförelsen och se själv.',
          ];
    default:
      return [milestone.title];
  }
}

/** Ett av meddelandena, valt stabilt ur id och datum (samma milstolpe → samma text). */
export function milestoneMessage(milestone: Milestone, date: string): string {
  const messages = milestoneMessages(milestone);
  let hash = 0;
  for (const ch of `${milestone.id}:${date}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return messages[hash % messages.length] ?? milestone.title;
}
