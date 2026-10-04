/**
 * Rena beräkningar för vikt, trend, mål och prognos. Inga sidoeffekter och
 * ingen databasåtkomst – allt som behövs skickas in, inklusive "idag".
 */
import { addDays, daysBetween, toDayNumber } from './dates.ts';

export interface DatedWeight {
  date: string;
  weightKg: number;
}

/** En dags viktvärde. Flera mätningar samma dag slås ihop till medelvärdet. */
export interface DailyWeight {
  date: string;
  weightKg: number;
  /** Antal mätningar som ingår i dagens värde. */
  count: number;
}

export interface TrendPoint {
  date: string;
  trendKg: number;
}

/** Utjämningsfaktor per dag för det exponentiella glidande medlet. */
export const EMA_ALPHA = 0.1;

/** Fönster (dagar) för trendlutningen som prognosen bygger på. */
export const TREND_WINDOW_DAYS = 28;

/** Minsta tidsspann (dagar) mellan första och sista mätning i fönstret för en prognos. */
export const MIN_TREND_SPAN_DAYS = 7;

/** Prognoser längre bort än så här räknas som att trenden inte leder till målet. */
export const MAX_FORECAST_DAYS = 5 * 365;

/** Avrundar till en decimal utan flyttalsbrus (81.49999 → 81.5). */
export function roundKg(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Grupperar mätningar per datum (medelvärde) och sorterar äldst först. */
export function dailyWeights(entries: readonly DatedWeight[]): DailyWeight[] {
  const byDate = new Map<string, number[]>();
  for (const entry of entries) {
    if (!Number.isFinite(entry.weightKg)) continue;
    const list = byDate.get(entry.date);
    if (list) list.push(entry.weightKg);
    else byDate.set(entry.date, [entry.weightKg]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, values]) => ({ date, weightKg: mean(values), count: values.length }));
}

/**
 * Exponentiellt glidande medel över dagliga värden. Luckor i datum hanteras
 * genom att vikten för det nya värdet motsvarar alla missade dagar:
 * `a = 1 − (1 − alpha)^dagar`. En lucka på 10 dagar drar alltså trenden
 * närmare det nya värdet än en enda dag gör.
 */
export function emaTrend(daily: readonly DailyWeight[], alpha = EMA_ALPHA): TrendPoint[] {
  const result: TrendPoint[] = [];
  let prev: { date: string; trendKg: number } | null = null;
  for (const point of daily) {
    if (!prev) {
      prev = { date: point.date, trendKg: point.weightKg };
    } else {
      const gap = Math.max(1, daysBetween(prev.date, point.date));
      const a = 1 - (1 - alpha) ** gap;
      prev = { date: point.date, trendKg: prev.trendKg + a * (point.weightKg - prev.trendKg) };
    }
    result.push(prev);
  }
  return result;
}

export interface GoalProgress {
  /** Nuvarande − start (negativt = gått ner). */
  changeKg: number;
  /** Kvar till målet, alltid ≥ 0. 0 när målet är nått eller passerat. */
  remainingKg: number;
  /** Andel av vägen från start till mål, 0–1. */
  fraction: number;
  reached: boolean;
}

/** Hur långt man kommit från startvikt mot målvikt. Fungerar för både ned- och uppgång. */
export function goalProgress(startKg: number, currentKg: number, goalKg: number): GoalProgress {
  const changeKg = currentKg - startKg;
  const total = goalKg - startKg;
  if (total === 0) {
    const remainingKg = Math.abs(goalKg - currentKg);
    const reached = roundKg(remainingKg) === 0;
    return { changeKg, remainingKg: reached ? 0 : remainingKg, fraction: reached ? 1 : 0, reached };
  }
  const direction = Math.sign(total);
  const reached = (goalKg - currentKg) * direction <= 0;
  return {
    changeKg,
    remainingKg: reached ? 0 : Math.abs(goalKg - currentKg),
    fraction: clamp(changeKg / total, 0, 1),
    reached,
  };
}

/** BMI = vikt / längd². `null` om längden saknas eller är orimlig. */
export function bmi(weightKg: number, heightCm: number): number | null {
  if (!(heightCm > 0) || !(weightKg > 0)) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** WHO:s kategorier för vuxna. */
export function bmiCategory(value: number): string {
  if (value < 18.5) return 'Undervikt';
  if (value < 25) return 'Normalvikt';
  if (value < 30) return 'Övervikt';
  return 'Fetma';
}

export interface WeekAverage {
  /** Första dagen i veckan (inklusive). */
  from: string;
  /** Sista dagen i veckan (inklusive). */
  to: string;
  /** Medelvikt för dagarna med mätning, `null` om veckan saknar mätningar. */
  averageKg: number | null;
  /** Antal dagar med mätning. */
  days: number;
}

/**
 * Medelvikt per vecka för de senaste `weeks` veckorna, äldst först.
 * Veckorna är rullande 7-dagarsfönster som slutar på `today`.
 */
export function weeklyAverages(
  daily: readonly DailyWeight[],
  today: string,
  weeks = 4,
): WeekAverage[] {
  const result: WeekAverage[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const to = addDays(today, -7 * i);
    const from = addDays(to, -6);
    const values = daily.filter((d) => d.date >= from && d.date <= to).map((d) => d.weightKg);
    result.push({
      from,
      to,
      averageKg: values.length > 0 ? mean(values) : null,
      days: values.length,
    });
  }
  return result;
}

export interface LinearTrend {
  /** Lutning i kg per dag. */
  slopeKgPerDay: number;
  /** Den anpassade linjens värde på senaste mätdagen. */
  fittedKg: number;
  /** Senaste mätdagen i fönstret. */
  lastDate: string;
}

/**
 * Minsta kvadrat-anpassning av en rät linje till de dagliga värdena under de
 * senaste `windowDays` dagarna fram till `today`. `null` om det finns för få
 * mätningar eller om de ligger för tätt för att ge en meningsfull trend.
 */
export function linearTrend(
  daily: readonly DailyWeight[],
  today: string,
  windowDays = TREND_WINDOW_DAYS,
): LinearTrend | null {
  const from = addDays(today, -(windowDays - 1));
  const points = daily.filter((d) => d.date >= from && d.date <= today);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) return null;
  if (daysBetween(first.date, last.date) < MIN_TREND_SPAN_DAYS) return null;

  const origin = toDayNumber(first.date);
  const xs = points.map((p) => toDayNumber(p.date) - origin);
  const ys = points.map((p) => p.weightKg);
  const xMean = mean(xs);
  const yMean = mean(ys);
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    const y = ys[i] ?? yMean;
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = num / den;
  const lastX = toDayNumber(last.date) - origin;
  return { slopeKgPerDay: slope, fittedKg: yMean + slope * (lastX - xMean), lastDate: last.date };
}

/** Trendprognos först när det gått så här många dagar sedan start … */
export const FORECAST_MIN_DAYS = 21;

/** … och det finns så här många vägningar (dagar med minst en vägning). */
export const FORECAST_MIN_WEIGH_INS = 12;

/** De första dagarna efter start (mest vätska och glykogen) räknas inte in i takten. */
export const FORECAST_EXCLUDED_DAYS = 14;

/** Hållbar takt per vecka som andel av trendvikten (prognosens tak, tillsammans med vald takt). */
export const SUSTAINABLE_SHARE_PER_WEEK = 0.01;

/** Intervallets bredd i standardfel för lutningen (≈ 95 %). */
export const FORECAST_SPREAD_SE = 2;

/** Intervall visas när takten är osäker med minst så här stor andel (±). */
export const FORECAST_RANGE_MIN_SHARE = 0.15;

export interface TrendSlope {
  /** Lutning i kg per dag. */
  slopeKgPerDay: number;
  /** Lutningens standardfel (kg per dag) ur residualernas spridning. */
  slopeSeKgPerDay: number;
  /** Den anpassade linjens värde på senaste punkten. */
  fittedKg: number;
  /** Senaste punkten. */
  lastDate: string;
}

/** Minsta kvadrat-anpassning med lutningens standardfel. Kräver minst tre punkter. */
function regression(points: readonly { date: string; kg: number }[]): TrendSlope | null {
  const last = points[points.length - 1];
  const first = points[0];
  if (!first || !last || points.length < 3) return null;
  const origin = toDayNumber(first.date);
  const xs = points.map((p) => toDayNumber(p.date) - origin);
  const ys = points.map((p) => p.kg);
  const xMean = mean(xs);
  const yMean = mean(ys);
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - xMean) * ((ys[i] ?? yMean) - yMean);
    sxx += (x - xMean) ** 2;
  });
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  let ssr = 0;
  xs.forEach((x, i) => {
    ssr += ((ys[i] ?? yMean) - (yMean + slope * (x - xMean))) ** 2;
  });
  const lastX = toDayNumber(last.date) - origin;
  return {
    slopeKgPerDay: slope,
    slopeSeKgPerDay: Math.sqrt(ssr / (points.length - 2) / sxx),
    fittedKg: yMean + slope * (lastX - xMean),
    lastDate: last.date,
  };
}

/** Varför det inte finns någon trendprognos. */
export type InsufficientReason =
  /** Färre än `FORECAST_MIN_DAYS` dagar sedan start. */
  | 'early'
  /** Färre än `FORECAST_MIN_WEIGH_INS` vägningar, eller för få efter vätskefasen. */
  | 'few-weigh-ins'
  /** Spridningen är så stor att den långsamma änden inte leder till målet. */
  | 'uncertain';

export type GoalForecast =
  | { kind: 'reached' }
  | { kind: 'insufficient-data'; reason: InsufficientReason }
  | { kind: 'not-progressing'; weeklyChangeKg: number }
  | {
      kind: 'forecast';
      date: string;
      /** Intervallet (tidigast–senast) när osäkerheten är stor, annars `null`. */
      range: { from: string; to: string } | null;
      /** Takten prognosen räknar med (kg/vecka, med tecken) – efter taket. */
      weeklyChangeKg: number;
      /** Den uppmätta takten (kg/vecka, med tecken) ur regressionen. */
      measuredWeeklyChangeKg: number;
      /** Den uppmätta takten var snabbare än taket – prognosen utgår från en hållbar takt. */
      capped: boolean;
      /** Dagar efter måldatum (negativt = före). `null` om inget måldatum finns. */
      daysVsGoalDate: number | null;
    };

export interface ForecastInput {
  daily: readonly DailyWeight[];
  goalKg: number;
  today: string;
  goalDate?: string | undefined;
  /** Startdatum (profilen); saknas det räknas från första vägningen. */
  startDate?: string | undefined;
  /** Vald takt i kg/vecka (positiv = mot målet); en del av prognosens tak. */
  rateKg?: number | undefined;
  windowDays?: number;
  /**
   * Vikten prognosen utgår från (t.ex. trendvikten eller senaste dagsvikten). Saknas den används
   * den anpassade linjens värde. Takten kommer alltid från linjen.
   */
  fromKg?: number | undefined;
}

/** Dagar till `remainingKg` med `kgPerWeek`, eller `null` om det inte går inom rimlig tid. */
function daysAt(remainingKg: number, kgPerWeek: number): number | null {
  if (kgPerWeek <= 0) return null;
  const days = (remainingKg / kgPerWeek) * 7;
  return Number.isFinite(days) && days <= MAX_FORECAST_DAYS ? Math.ceil(days) : null;
}

/**
 * Datum då målvikten nås, robust mot den snabba starten:
 * - först när det gått `FORECAST_MIN_DAYS` dagar sedan start och finns `FORECAST_MIN_WEIGH_INS`
 *   vägningar (annars `insufficient-data` → datum enligt vald takt),
 * - takten = linjär regression på trendvikten (EMA) de senaste `windowDays` dagarna, utan de
 *   första `FORECAST_EXCLUDED_DAYS` dagarna efter start (vätskefasen),
 * - aldrig snabbare än det högsta av vald takt och 1 % av trendvikten per vecka (`capped`),
 * - intervall (`range`) när lutningens spridning är stor.
 */
export function forecastGoal({
  daily,
  goalKg,
  today,
  goalDate,
  startDate,
  rateKg,
  windowDays = TREND_WINDOW_DAYS,
  fromKg,
}: ForecastInput): GoalForecast {
  const weighIns = daily.filter((d) => d.date <= today);
  const first = weighIns[0];
  const start = startDate ?? first?.date ?? today;
  if (daysBetween(start, today) < FORECAST_MIN_DAYS) {
    return { kind: 'insufficient-data', reason: 'early' };
  }
  if (!first || weighIns.length < FORECAST_MIN_WEIGH_INS) {
    return { kind: 'insufficient-data', reason: 'few-weigh-ins' };
  }

  const trend = emaTrend(weighIns);
  const windowStart = addDays(today, -(windowDays - 1));
  const afterWaterPhase = addDays(start, FORECAST_EXCLUDED_DAYS);
  const from = windowStart > afterWaterPhase ? windowStart : afterWaterPhase;
  const points = trend.filter((t) => t.date >= from).map((t) => ({ date: t.date, kg: t.trendKg }));
  const firstPoint = points[0];
  const fit = regression(points);
  if (!fit || !firstPoint || daysBetween(firstPoint.date, fit.lastDate) < MIN_TREND_SPAN_DAYS) {
    return { kind: 'insufficient-data', reason: 'few-weigh-ins' };
  }

  const measuredWeeklyChangeKg = fit.slopeKgPerDay * 7;
  const remaining = goalKg - (fromKg ?? fit.fittedKg);
  if (roundKg(remaining) === 0) return { kind: 'reached' };
  const direction = Math.sign(remaining);
  const distance = Math.abs(remaining);
  // Takt mot målet (kg/vecka, positiv = rätt håll).
  const towardKg = measuredWeeklyChangeKg * direction;
  const days = daysAt(distance, towardKg);
  if (days == null) return { kind: 'not-progressing', weeklyChangeKg: measuredWeeklyChangeKg };

  const capKg = Math.max(rateKg ?? 0, SUSTAINABLE_SHARE_PER_WEEK * (fromKg ?? fit.fittedKg));
  const capped = towardKg > capKg;
  const usedKg = Math.min(towardKg, capKg);
  // Räknas från idag: med gamla vägningar (kvar i fönstret) hamnar datumet aldrig bakåt i tiden.
  const date = addDays(today, daysAt(distance, usedKg) ?? days);

  const spreadKg = FORECAST_SPREAD_SE * fit.slopeSeKgPerDay * 7;
  const slowDays = daysAt(distance, Math.min(towardKg - spreadKg, capKg));
  if (slowDays == null) return { kind: 'insufficient-data', reason: 'uncertain' };
  const fastDays = daysAt(distance, Math.min(towardKg + spreadKg, capKg)) ?? slowDays;
  const range = { from: addDays(today, fastDays), to: addDays(today, slowDays) };
  const wide =
    spreadKg / towardKg >= FORECAST_RANGE_MIN_SHARE &&
    range.from.slice(0, 7) !== range.to.slice(0, 7);

  return {
    kind: 'forecast',
    date,
    range: wide ? range : null,
    weeklyChangeKg: usedKg * direction,
    measuredWeeklyChangeKg,
    capped,
    daysVsGoalDate: goalDate ? daysBetween(goalDate, date) : null,
  };
}

export type RangeId = '1m' | '3m' | 'all';

export const RANGE_DAYS: Record<Exclude<RangeId, 'all'>, number> = { '1m': 30, '3m': 91 };

/** Behåller poster inom de senaste 30/91 dagarna fram till och med `today`. */
export function filterRange<T extends { date: string }>(
  items: readonly T[],
  range: RangeId,
  today: string,
): T[] {
  if (range === 'all') return [...items];
  const from = addDays(today, -(RANGE_DAYS[range] - 1));
  return items.filter((item) => item.date >= from && item.date <= today);
}

export interface DatedSteps {
  date: string;
  steps?: number | undefined;
  createdAt: number;
}

export interface DailySteps {
  date: string;
  steps: number;
}

/**
 * Steg per dag, äldst först. Stegräknare visar en löpande dagssumma, så vid
 * flera mätningar samma dag används den senast registrerade.
 */
export function dailySteps(entries: readonly DatedSteps[]): DailySteps[] {
  const byDate = new Map<string, { steps: number; createdAt: number }>();
  for (const entry of entries) {
    if (entry.steps == null || !Number.isFinite(entry.steps)) continue;
    const existing = byDate.get(entry.date);
    if (!existing || entry.createdAt >= existing.createdAt) {
      byDate.set(entry.date, { steps: entry.steps, createdAt: entry.createdAt });
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, { steps }]) => ({ date, steps }));
}
