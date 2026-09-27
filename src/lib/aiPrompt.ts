/**
 * "Fråga AI": bygger en prompt (mall i aiPromptTemplate.ts) av det användaren
 * valt att dela, och länkar för att öppna den i ChatGPT eller Claude. Appen skickar
 * aldrig något själv – användaren delar, kopierar eller öppnar länken. Rena funktioner.
 */
import type {
  FoodLogEntry,
  Injection,
  Medication,
  Profile,
  SymptomEntry,
  WeightEntry,
} from '../db/db.ts';
import { addDays } from './dates.ts';
import { CALORIE_FLOOR, ageFromBirthYear, type Sex } from './energy.ts';
import { formatDayMonth, formatInt, formatKcal, formatKg, formatMg, formatRate } from './format.ts';
import { doseOn, isActive, medicationStart } from './glp1.ts';
import { AI_PROMPT_NO_CONTEXT, AI_PROMPT_TEMPLATE } from './aiPromptTemplate.ts';
import {
  dailyIntake,
  mealLabel,
  scaleNutrients,
  totalOf,
  type MealSlot,
  type Nutrients,
} from './nutrition.ts';
import { buildPlan } from './plan.ts';
import { proteinGoalFor } from './protein.ts';
import { dailyWeights, emaTrend } from './stats.ts';
import { loggedAmountText } from './units.ts';

export type AiOption =
  'personal' | 'body' | 'goal' | 'targets' | 'dayIntake' | 'content' | 'preferences' | 'glp1';

export type AiScope = 'meal' | 'day' | 'week';

export interface AiOptionInfo {
  id: AiOption;
  label: string;
  /** Var kryssrutan visas. */
  scopes: readonly AiScope[];
}

const ALL: readonly AiScope[] = ['meal', 'day', 'week'];

export const AI_OPTIONS: readonly AiOptionInfo[] = [
  { id: 'personal', label: 'Ålder och kön', scopes: ALL },
  { id: 'body', label: 'Längd och trendvikt', scopes: ALL },
  { id: 'goal', label: 'Målvikt och takt', scopes: ALL },
  { id: 'targets', label: 'Kcal- och proteinmål', scopes: ALL },
  { id: 'dayIntake', label: 'Dagens intag hittills', scopes: ['meal'] },
  { id: 'content', label: 'Måltidens innehåll', scopes: ALL },
  { id: 'preferences', label: 'Matpreferenser', scopes: ALL },
  { id: 'glp1', label: 'GLP-1-behandling', scopes: ALL },
];

/** Etiketten för innehållet beror på vad som analyseras. */
export function optionLabel(option: AiOptionInfo, scope: AiScope): string {
  if (option.id !== 'content') return option.label;
  if (scope === 'day') return 'Dagens mat';
  if (scope === 'week') return 'Veckans mat';
  return option.label;
}

export type AiOptions = Record<AiOption, boolean>;

/** Allt är med utom GLP-1, som är känsligt och kräver ett aktivt val. */
export const DEFAULT_AI_OPTIONS: AiOptions = {
  personal: true,
  body: true,
  goal: true,
  targets: true,
  dayIntake: true,
  content: true,
  preferences: true,
  glp1: false,
};

export function parseAiOptions(raw: unknown): AiOptions {
  const stored = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result = { ...DEFAULT_AI_OPTIONS };
  for (const key of Object.keys(result) as AiOption[]) {
    const value = stored[key];
    if (typeof value === 'boolean') result[key] = value;
  }
  return result;
}

/** Det som går att dela om användaren. `null` = okänt. */
export interface AiContext {
  age: number | null;
  sex: Sex | null;
  heightCm: number | null;
  trendKg: number | null;
  goalWeightKg: number | null;
  ratePerWeekKg: number | null;
  targetKcal: number | null;
  proteinGoalG: number | null;
  /** Kalorigolvet (1 500 man / 1 200 kvinna); 1 200 om könet inte delas. */
  floorKcal: Record<Sex, number> & { unknown: number };
  /** Hela dagens intag (för måltidsanalysen: "dagens intag hittills"). */
  dayIntake: Nutrients | null;
  foodPreferences: string | null;
  /** T.ex. "Wegovy 1 mg per vecka sedan 3 aug.; aptit 2 av 5, illamående (25 sep.)". */
  glp1: string | null;
}

export interface AiContextInput {
  profile: Profile | null;
  weights: readonly WeightEntry[];
  foodLog: readonly FoodLogEntry[];
  medications: readonly Medication[];
  injections: readonly Injection[];
  symptoms: readonly SymptomEntry[];
}

function glp1Text(input: AiContextInput, today: string): string | null {
  const active = input.medications.filter((m) => {
    const start = medicationStart(m);
    return start !== null && start <= today && isActive(m, today);
  });
  if (active.length === 0) return null;
  const meds = active.map((m) => {
    const dose = doseOn(m, today);
    const freq = m.frequency === 'vecka' ? 'per vecka' : 'per dag';
    const start = medicationStart(m);
    return [
      m.name,
      dose === null ? null : formatMg(dose),
      freq,
      start ? `sedan ${formatDayMonth(start)}` : null,
    ]
      .filter((p) => p !== null)
      .join(' ');
  });
  const recent = [...input.symptoms]
    .filter((s) => s.date <= today && s.date >= addDays(today, -7))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  let text = meds.join('; ');
  if (recent) {
    const parts = [
      recent.appetite !== undefined ? `aptit ${String(recent.appetite)} av 5` : null,
      ...recent.sideEffects,
    ].filter((p) => p !== null);
    if (parts.length > 0) text += `; senast (${formatDayMonth(recent.date)}): ${parts.join(', ')}`;
  }
  return text;
}

/** Sammanställer allt som kan delas ur appens data. */
export function aiContextFrom(input: AiContextInput, today: string): AiContext {
  const { profile } = input;
  const plan = profile ? buildPlan(profile, input.weights, input.foodLog, today) : null;
  const trend = emaTrend(dailyWeights(input.weights.filter((w) => w.date <= today)));
  const todays = input.foodLog.filter((e) => e.date === today);
  return {
    age: profile?.birthYear !== undefined ? ageFromBirthYear(profile.birthYear, today) : null,
    sex: profile?.sex ?? null,
    heightCm: profile?.heightCm ?? null,
    trendKg:
      plan?.kind === 'plan'
        ? plan.trendKg
        : (trend[trend.length - 1]?.trendKg ?? profile?.startWeightKg ?? null),
    goalWeightKg: profile?.goalWeightKg ?? null,
    ratePerWeekKg: profile ? (profile.ratePerWeekKg ?? 0.5) : null,
    targetKcal: plan?.kind === 'plan' ? plan.plan.targetKcal : null,
    proteinGoalG: proteinGoalFor(profile),
    floorKcal: { ...CALORIE_FLOOR, unknown: Math.min(CALORIE_FLOOR.man, CALORIE_FLOOR.kvinna) },
    dayIntake: todays.length > 0 ? totalOf(todays) : null,
    foodPreferences: profile?.foodPreferences?.trim() || null,
    glp1: glp1Text(input, today),
  };
}

export interface PromptItem {
  name: string;
  amount: string;
  kcal: number;
  proteinG: number;
  meal?: string;
}

export type AiSubject =
  | { kind: 'meal'; meal: MealSlot; date: string; items: PromptItem[]; totals: Nutrients }
  | { kind: 'day'; date: string; items: PromptItem[]; totals: Nutrients }
  | {
      kind: 'week';
      from: string;
      to: string;
      days: { date: string; kcal: number; proteinG: number }[];
      topFoods: { name: string; kcal: number }[];
    };

function promptItem(entry: FoodLogEntry, withMeal: boolean): PromptItem {
  const n = scaleNutrients(entry.per100, entry.grams);
  const item: PromptItem = {
    name: entry.name,
    amount: loggedAmountText(entry),
    kcal: n.kcal,
    proteinG: n.proteinG,
  };
  if (withMeal) item.meal = mealLabel(entry.meal);
  return item;
}

export function mealSubject(
  entries: readonly FoodLogEntry[],
  meal: MealSlot,
  date: string,
): AiSubject {
  const items = [...entries]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((e) => promptItem(e, false));
  return { kind: 'meal', meal, date, items, totals: totalOf(entries) };
}

export function daySubject(entries: readonly FoodLogEntry[], date: string): AiSubject {
  const order: MealSlot[] = ['frukost', 'lunch', 'middag', 'mellanmal'];
  const items = [...entries]
    .sort((a, b) => order.indexOf(a.meal) - order.indexOf(b.meal) || a.createdAt - b.createdAt)
    .map((e) => promptItem(e, true));
  return { kind: 'day', date, items, totals: totalOf(entries) };
}

/** Veckan måndag `from` – söndag `to`: intag per loggad dag och de livsmedel som gav mest energi. */
export function weekSubject(
  foodLog: readonly FoodLogEntry[],
  from: string,
  to: string,
  topCount = 8,
): AiSubject {
  const inWeek = foodLog.filter((e) => e.date >= from && e.date <= to);
  const days = dailyIntake(inWeek).map((d) => ({
    date: d.date,
    kcal: d.kcal,
    proteinG: d.proteinG,
  }));
  const byFood = new Map<string, number>();
  for (const e of inWeek) {
    byFood.set(e.name, (byFood.get(e.name) ?? 0) + scaleNutrients(e.per100, e.grams).kcal);
  }
  const topFoods = [...byFood.entries()]
    .map(([name, kcal]) => ({ name, kcal }))
    .sort((a, b) => b.kcal - a.kcal)
    .slice(0, topCount);
  return { kind: 'week', from, to, days, topFoods };
}

/** Vad som bedöms, t.ex. "min frukost 26 sep". */
function subjectText(subject: AiSubject): { long: string; short: string } {
  if (subject.kind === 'meal') {
    return {
      long: `min ${mealLabel(subject.meal).toLowerCase()} ${formatDayMonth(subject.date)}`,
      short: 'måltiden',
    };
  }
  if (subject.kind === 'day')
    return { long: `min mat ${formatDayMonth(subject.date)}`, short: 'dagen' };
  return {
    long: `min mat veckan ${formatDayMonth(subject.from)}–${formatDayMonth(subject.to)}`,
    short: 'veckan',
  };
}

function kcalProtein(n: { kcal: number; proteinG: number }): string {
  return `${formatKcal(n.kcal)}, ${formatInt(Math.round(n.proteinG))} g protein`;
}

function contentLines(subject: AiSubject): string[] {
  if (subject.kind === 'week') {
    if (subject.days.length === 0) return ['Veckans mat: inget loggat.'];
    const avg = {
      kcal: subject.days.reduce((s, d) => s + d.kcal, 0) / subject.days.length,
      proteinG: subject.days.reduce((s, d) => s + d.proteinG, 0) / subject.days.length,
    };
    return [
      `Veckans mat (${subject.days.length === 1 ? '1 loggad dag' : `${String(subject.days.length)} loggade dagar`}), snitt ${kcalProtein(avg)} per dag:`,
      ...subject.days.map((d) => `- ${formatDayMonth(d.date)}: ${kcalProtein(d)}`),
      'Det som gav mest energi under veckan:',
      ...subject.topFoods.map((f) => `- ${f.name}: ${formatKcal(f.kcal)}`),
    ];
  }
  const heading =
    subject.kind === 'meal'
      ? `${mealLabel(subject.meal)} (totalt ${kcalProtein(subject.totals)}):`
      : `Dagens mat (totalt ${kcalProtein(subject.totals)}):`;
  if (subject.items.length === 0) return [heading, '- inget loggat'];
  return [
    heading,
    ...subject.items.map(
      (i) => `- ${i.meal ? `${i.meal}: ` : ''}${i.name}, ${i.amount} (${kcalProtein(i)})`,
    ),
  ];
}

/** Raderna i underlaget, i mallens ordning. Bara valda och kända uppgifter tas med. */
export function contextLines(subject: AiSubject, context: AiContext, options: AiOptions): string[] {
  const scope = subject.kind;
  const on = (id: AiOption) =>
    options[id] && (AI_OPTIONS.find((o) => o.id === id)?.scopes.includes(scope) ?? false);
  const lines: string[] = [];
  const about: string[] = [];
  if (on('personal')) {
    if (context.age !== null) about.push(`${String(context.age)} år`);
    if (context.sex !== null) about.push(context.sex);
  }
  if (on('body')) {
    if (context.heightCm !== null) about.push(`${formatInt(context.heightCm)} cm`);
    if (context.trendKg !== null) about.push(`trendvikt ${formatKg(context.trendKg)}`);
  }
  if (about.length > 0) lines.push(`Om mig: ${about.join(', ')}.`);
  if (on('goal') && context.goalWeightKg !== null) {
    const rate =
      context.ratePerWeekKg === null
        ? ''
        : context.ratePerWeekKg === 0
          ? ', jag vill hålla vikten'
          : `, takt ${formatRate(context.ratePerWeekKg)}`;
    lines.push(`Mål: ${formatKg(context.goalWeightKg)}${rate}.`);
  }
  if (on('targets')) {
    const targets: string[] = [];
    if (context.targetKcal !== null) targets.push(formatKcal(context.targetKcal));
    if (context.proteinGoalG !== null) {
      targets.push(`${formatInt(context.proteinGoalG)} g protein`);
    }
    if (targets.length > 0) lines.push(`Dagsmål: ${targets.join(' och ')}.`);
  }
  if (on('dayIntake') && context.dayIntake !== null) {
    lines.push(`Dagens intag hittills (inklusive måltiden): ${kcalProtein(context.dayIntake)}.`);
  }
  if (on('preferences') && context.foodPreferences !== null) {
    lines.push(`Mina matpreferenser: ${context.foodPreferences}`);
  }
  if (on('glp1') && context.glp1 !== null) {
    lines.push(`Jag behandlas med GLP-1: ${context.glp1}.`);
  }
  if (on('content')) {
    if (lines.length > 0) lines.push('');
    lines.push(...contentLines(subject));
  }
  return lines;
}

/** Kalorigolvet som används i prompten: könets om det delas, annars det lägsta. */
export function promptFloor(context: AiContext, options: AiOptions): number {
  return options.personal && context.sex !== null
    ? context.floorKcal[context.sex]
    : context.floorKcal.unknown;
}

export function buildAiPrompt(
  subject: AiSubject,
  context: AiContext,
  options: AiOptions,
  template: string = AI_PROMPT_TEMPLATE,
): string {
  const lines = contextLines(subject, context, options);
  const { long, short } = subjectText(subject);
  const values: Record<string, string> = {
    amne: long,
    amneKort: short,
    underlag: lines.length > 0 ? lines.join('\n') : AI_PROMPT_NO_CONTEXT,
    kalorigolv: formatKcal(promptFloor(context, options)),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match).trim();
}

/** Längsta länk vi skapar – längre adresser avvisas av en del webbläsare och servrar. */
export const MAX_URL_LENGTH = 6000;

export type AiService = 'chatgpt' | 'claude';

export const AI_SERVICES: readonly { id: AiService; label: string; home: string; query: string }[] =
  [
    {
      id: 'chatgpt',
      label: 'ChatGPT',
      home: 'https://chatgpt.com/',
      query: 'https://chatgpt.com/?q=',
    },
    {
      id: 'claude',
      label: 'Claude',
      home: 'https://claude.ai/new',
      query: 'https://claude.ai/new?q=',
    },
  ];

/**
 * Adressen som öppnar tjänsten med prompten förifylld, eller `null` om prompten
 * inte får plats – då kopieras den och startsidan öppnas.
 */
export function aiServiceUrl(service: AiService, prompt: string): string | null {
  const info = AI_SERVICES.find((s) => s.id === service);
  if (!info) return null;
  const url = info.query + encodeURIComponent(prompt);
  return url.length <= MAX_URL_LENGTH ? url : null;
}

export function aiServiceHome(service: AiService): string {
  return AI_SERVICES.find((s) => s.id === service)?.home ?? 'about:blank';
}
