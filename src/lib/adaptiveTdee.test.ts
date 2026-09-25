import { describe, expect, it } from 'vitest';
import { adaptiveTdee, confidenceFor, regress, type DatedKcal } from './adaptiveTdee.ts';
import { addDays } from './dates.ts';
import type { DailyWeight } from './stats.ts';

const TODAY = '2026-03-01';
const FORMULA = 2400;

interface Series {
  days: number;
  /** Verklig förbrukning. */
  trueTdee: number;
  intake: (day: number) => number;
  /** Brus i vikten (kg) dag för dag. */
  noise?: (day: number) => number;
  startKg?: number;
  /** Dagar (index) utan matlogg. */
  skipIntake?: (day: number) => boolean;
  skipWeight?: (day: number) => boolean;
}

/**
 * Syntetisk dataserie som slutar igår: vikten ändras enligt energibalansen
 * (intag − verklig TDEE) / 7 700 per dag, plus deterministiskt brus.
 */
function series({
  days,
  trueTdee,
  intake,
  noise = () => 0,
  startKg = 95,
  skipIntake = () => false,
  skipWeight = () => false,
}: Series): { daily: DailyWeight[]; intake: DatedKcal[] } {
  const daily: DailyWeight[] = [];
  const log: DatedKcal[] = [];
  let mass = startKg;
  for (let i = 0; i < days; i++) {
    const date = addDays(TODAY, -(days - i));
    if (!skipWeight(i)) daily.push({ date, weightKg: mass + noise(i), count: 1 });
    const kcal = intake(i);
    if (!skipIntake(i)) log.push({ date, kcal });
    mass += (kcal - trueTdee) / 7700;
  }
  return { daily, intake: log };
}

/** Vätskesvängningar på ±0,4 kg. */
const wobble = (i: number) => 0.4 * Math.sin(i * 1.7) * Math.cos(i * 0.6);

describe('adaptiveTdee', () => {
  it('hittar verklig TDEE ur ett jämnt underskott', () => {
    const data = series({ days: 28, trueTdee: 2600, intake: () => 2100 });
    const result = adaptiveTdee({ ...data, today: TODAY, formulaTdee: FORMULA });
    expect(result.kind).toBe('adaptive');
    if (result.kind !== 'adaptive') return;
    expect(result.observedTdee).toBeCloseTo(2600, 0);
    expect(result.averageIntakeKcal).toBe(2100);
    expect(result.weeklyChangeKg).toBeCloseTo((-500 * 7) / 7700, 3);
    expect(result.uncertaintyKcal).toBeLessThan(1);
    expect(result.weight).toBeCloseTo(0.9, 2);
    expect(result.confidence).toBe('hög');
    // Viktad glidning mot formeln.
    expect(result.tdee).toBeCloseTo(0.9 * 2600 + 0.1 * FORMULA, 0);
    expect(result.windowDays).toBe(28);
    expect(result.bothDays).toBe(28);
  });

  it('hittar verklig TDEE även vid viktökning och med brus', () => {
    const data = series({ days: 28, trueTdee: 2300, intake: () => 2800, noise: wobble });
    const result = adaptiveTdee({ ...data, today: TODAY, formulaTdee: FORMULA });
    expect(result.kind).toBe('adaptive');
    if (result.kind !== 'adaptive') return;
    expect(Math.abs(result.observedTdee - 2300)).toBeLessThan(result.uncertaintyKcal * 3);
    expect(result.weeklyChangeKg).toBeGreaterThan(0);
  });

  it('brus sänker vikten och säkerheten jämfört med rena data', () => {
    const clean = adaptiveTdee({
      ...series({ days: 28, trueTdee: 2600, intake: () => 2100 }),
      today: TODAY,
      formulaTdee: FORMULA,
    });
    const noisy = adaptiveTdee({
      ...series({ days: 28, trueTdee: 2600, intake: () => 2100, noise: (i) => 3 * wobble(i) }),
      today: TODAY,
      formulaTdee: FORMULA,
    });
    if (clean.kind !== 'adaptive' || noisy.kind !== 'adaptive')
      throw new Error('väntade skattning');
    expect(noisy.uncertaintyKcal).toBeGreaterThan(clean.uncertaintyKcal);
    expect(noisy.weight).toBeLessThan(clean.weight);
    expect(Math.abs(noisy.tdee - FORMULA)).toBeLessThan(Math.abs(noisy.observedTdee - FORMULA));
  });

  it('14 dagar räcker, men ger lägre vikt än 28', () => {
    const data = series({ days: 14, trueTdee: 2600, intake: () => 2100 });
    const result = adaptiveTdee({ ...data, today: TODAY, formulaTdee: FORMULA });
    expect(result.kind).toBe('adaptive');
    if (result.kind !== 'adaptive') return;
    expect(result.weight).toBeCloseTo(0.45, 2);
    expect(result.confidence).toBe('medel');
  });

  it('13 dagar räcker inte – formeln används', () => {
    const data = series({ days: 13, trueTdee: 2600, intake: () => 2100 });
    const result = adaptiveTdee({ ...data, today: TODAY, formulaTdee: FORMULA });
    expect(result).toMatchObject({ kind: 'formula', tdee: FORMULA, windowDays: 13, bothDays: 13 });
  });

  it('kräver minst 80 % loggade matdagar i fönstret', () => {
    // 28 dagar, var fjärde dag saknar matlogg → 21/28 = 75 %.
    const sparse = series({
      days: 28,
      trueTdee: 2600,
      intake: () => 2100,
      skipIntake: (i) => i % 4 === 1,
    });
    const result = adaptiveTdee({ ...sparse, today: TODAY, formulaTdee: FORMULA });
    expect(result.kind).toBe('formula');
    expect(result.loggedFraction).toBeCloseTo(0.75);

    // Var sjätte dag saknas → 23/28 ≈ 82 %: räcker.
    const ok = series({
      days: 28,
      trueTdee: 2600,
      intake: () => 2100,
      skipIntake: (i) => i % 6 === 1,
    });
    const okResult = adaptiveTdee({ ...ok, today: TODAY, formulaTdee: FORMULA });
    expect(okResult.kind).toBe('adaptive');
    if (okResult.kind !== 'adaptive') return;
    expect(okResult.observedTdee).toBeCloseTo(2600, 0);
    expect(okResult.weight).toBeLessThan(0.9);
  });

  it('kräver minst 14 dagar med både vikt och matlogg', () => {
    // Full matlogg men vikt bara varannan dag → 14 av 28, precis tillräckligt.
    const every2 = series({
      days: 28,
      trueTdee: 2600,
      intake: () => 2100,
      skipWeight: (i) => i % 2 === 1,
    });
    expect(adaptiveTdee({ ...every2, today: TODAY, formulaTdee: FORMULA }).kind).toBe('adaptive');

    const every3 = series({
      days: 28,
      trueTdee: 2600,
      intake: () => 2100,
      skipWeight: (i) => i % 3 !== 0,
    });
    const result = adaptiveTdee({ ...every3, today: TODAY, formulaTdee: FORMULA });
    expect(result.kind).toBe('formula');
    expect(result.bothDays).toBe(10);
  });

  it('fönstret börjar vid första matloggen och är högst 28 dagar', () => {
    const data = series({ days: 60, trueTdee: 2600, intake: () => 2100 });
    const result = adaptiveTdee({ ...data, today: TODAY, formulaTdee: FORMULA });
    expect(result.windowDays).toBe(28);
    expect(result.from).toBe(addDays(TODAY, -28));
    expect(result.to).toBe(addDays(TODAY, -1));
  });

  it('räknar inte med dagens ofullständiga matlogg', () => {
    const data = series({ days: 28, trueTdee: 2600, intake: () => 2100 });
    const withToday = {
      daily: data.daily,
      intake: [...data.intake, { date: TODAY, kcal: 300 }],
    };
    const a = adaptiveTdee({ ...data, today: TODAY, formulaTdee: FORMULA });
    const b = adaptiveTdee({ ...withToday, today: TODAY, formulaTdee: FORMULA });
    expect(b).toEqual(a);
  });

  it('orimlig skattning kläms och får halv vikt', () => {
    // Stabil vikt men bara 500 kcal loggat per dag → loggen är uppenbart ofullständig.
    const data = series({ days: 28, trueTdee: 500, intake: () => 500 });
    const result = adaptiveTdee({ ...data, today: TODAY, formulaTdee: FORMULA });
    expect(result.kind).toBe('adaptive');
    if (result.kind !== 'adaptive') return;
    expect(result.clamped).toBe(true);
    expect(result.observedTdee).toBeCloseTo(0.6 * FORMULA);
    expect(result.weight).toBeCloseTo(0.45, 2);
  });

  it('utan data används formeln', () => {
    expect(
      adaptiveTdee({ daily: [], intake: [], today: TODAY, formulaTdee: FORMULA }),
    ).toMatchObject({ kind: 'formula', tdee: FORMULA, loggedDays: 0, bothDays: 0 });
  });
});

describe('regress', () => {
  it('anpassar en rät linje och ger standardfel 0 för perfekta data', () => {
    const fit = regress([0, 1, 2, 3].map((x) => ({ x, y: 10 - 0.5 * x })));
    expect(fit?.slope).toBeCloseTo(-0.5);
    expect(fit?.slopeSe).toBeCloseTo(0);
  });

  it('kräver minst tre punkter med spridning i x', () => {
    expect(
      regress([
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ]),
    ).toBeNull();
    expect(regress([0, 0, 0].map((x) => ({ x, y: x })))).toBeNull();
  });
});

describe('confidenceFor', () => {
  it('delar in vikten i låg, medel och hög', () => {
    expect(confidenceFor(0.2)).toBe('låg');
    expect(confidenceFor(0.35)).toBe('medel');
    expect(confidenceFor(0.6)).toBe('hög');
  });
});
