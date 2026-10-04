import { describe, expect, it } from 'vitest';
import { addDays, daysBetween } from './dates.ts';
import {
  EMA_ALPHA,
  bmi,
  bmiCategory,
  dailySteps,
  dailyWeights,
  emaTrend,
  filterRange,
  forecastGoal,
  goalProgress,
  linearTrend,
  roundKg,
  weeklyAverages,
  type DailyWeight,
} from './stats.ts';

/** Bygger dagliga värden från `start`, ett värde per `step` dagar. */
function series(start: string, values: number[], step = 1): DailyWeight[] {
  return values.map((weightKg, i) => ({ date: addDays(start, i * step), weightKg, count: 1 }));
}

describe('roundKg', () => {
  it('avrundar till en decimal utan flyttalsbrus', () => {
    expect(roundKg(81.449999)).toBe(81.4);
    expect(roundKg(81.45)).toBe(81.5);
    expect(roundKg(0.1 + 0.2)).toBe(0.3);
  });
});

describe('dailyWeights', () => {
  it('ger tom lista utan mätningar', () => {
    expect(dailyWeights([])).toEqual([]);
  });

  it('hanterar en enda mätning', () => {
    expect(dailyWeights([{ date: '2026-01-01', weightKg: 80 }])).toEqual([
      { date: '2026-01-01', weightKg: 80, count: 1 },
    ]);
  });

  it('slår ihop samma dag två gånger till medelvärdet', () => {
    const result = dailyWeights([
      { date: '2026-01-02', weightKg: 80 },
      { date: '2026-01-01', weightKg: 81 },
      { date: '2026-01-02', weightKg: 81 },
    ]);
    expect(result).toEqual([
      { date: '2026-01-01', weightKg: 81, count: 1 },
      { date: '2026-01-02', weightKg: 80.5, count: 2 },
    ]);
  });

  it('ignorerar ogiltiga värden', () => {
    expect(dailyWeights([{ date: '2026-01-01', weightKg: Number.NaN }])).toEqual([]);
  });
});

describe('emaTrend', () => {
  it('startar på första värdet', () => {
    expect(emaTrend(series('2026-01-01', [80]))).toEqual([{ date: '2026-01-01', trendKg: 80 }]);
  });

  it('följer standardformeln för dagliga värden', () => {
    const trend = emaTrend(series('2026-01-01', [80, 81, 81]));
    expect(trend[1]?.trendKg).toBeCloseTo(80 + EMA_ALPHA * 1);
    expect(trend[2]?.trendKg).toBeCloseTo(80.1 + EMA_ALPHA * 0.9);
  });

  it('väger en lucka i datum som motsvarande antal missade dagar', () => {
    const withGap = emaTrend([
      { date: '2026-01-01', weightKg: 80, count: 1 },
      { date: '2026-01-11', weightKg: 70, count: 1 },
    ]);
    // Samma resultat som tio dagliga värden på 70.
    const daily = emaTrend(series('2026-01-01', [80, ...Array<number>(10).fill(70)]));
    expect(withGap[1]?.trendKg).toBeCloseTo(daily[10]?.trendKg ?? Number.NaN);
    // Och närmare det nya värdet än en enda dags steg.
    expect(withGap[1]?.trendKg).toBeLessThan(80 - EMA_ALPHA * 10);
  });

  it('ger tom trend för tom indata', () => {
    expect(emaTrend([])).toEqual([]);
  });
});

describe('goalProgress', () => {
  it('räknar framsteg vid viktnedgång', () => {
    const p = goalProgress(90, 85, 80);
    expect(p.changeKg).toBe(-5);
    expect(p.remainingKg).toBe(5);
    expect(p.fraction).toBe(0.5);
    expect(p.reached).toBe(false);
  });

  it('räknar framsteg vid viktuppgång', () => {
    const p = goalProgress(60, 63, 66);
    expect(p.fraction).toBe(0.5);
    expect(p.remainingKg).toBe(3);
  });

  it('klämmer andelen till 0–1', () => {
    expect(goalProgress(90, 92, 80).fraction).toBe(0);
    const passed = goalProgress(90, 78, 80);
    expect(passed.fraction).toBe(1);
    expect(passed.reached).toBe(true);
    expect(passed.remainingKg).toBe(0);
  });

  it('hanterar mål lika med startvikt', () => {
    expect(goalProgress(80, 80, 80)).toMatchObject({ fraction: 1, reached: true, remainingKg: 0 });
    expect(goalProgress(80, 81, 80)).toMatchObject({ fraction: 0, reached: false, remainingKg: 1 });
  });
});

describe('bmi', () => {
  it('räknar BMI', () => {
    expect(bmi(80, 180)).toBeCloseTo(24.69, 2);
  });

  it('returnerar null för saknad längd', () => {
    expect(bmi(80, 0)).toBeNull();
    expect(bmi(80, Number.NaN)).toBeNull();
  });

  it('kategoriserar enligt WHO', () => {
    expect(bmiCategory(18.4)).toBe('Undervikt');
    expect(bmiCategory(18.5)).toBe('Normalvikt');
    expect(bmiCategory(25)).toBe('Övervikt');
    expect(bmiCategory(30)).toBe('Fetma');
  });
});

describe('weeklyAverages', () => {
  it('ger fyra rullande veckor äldst först, med null för tomma veckor', () => {
    const daily = [
      ...series('2026-01-01', [84, 83]), // vecka 1 (1–7 jan)
      ...series('2026-01-22', [81, 80, 79]), // vecka 4 (22–28 jan)
    ];
    const weeks = weeklyAverages(daily, '2026-01-28');
    expect(weeks.map((w) => [w.from, w.to])).toEqual([
      ['2026-01-01', '2026-01-07'],
      ['2026-01-08', '2026-01-14'],
      ['2026-01-15', '2026-01-21'],
      ['2026-01-22', '2026-01-28'],
    ]);
    expect(weeks.map((w) => w.averageKg)).toEqual([83.5, null, null, 80]);
    expect(weeks.map((w) => w.days)).toEqual([2, 0, 0, 3]);
  });

  it('ignorerar mätningar efter idag', () => {
    const weeks = weeklyAverages(series('2026-01-28', [80, 70]), '2026-01-28', 1);
    expect(weeks[0]?.averageKg).toBe(80);
  });
});

describe('linearTrend', () => {
  it('kräver minst två mätningar', () => {
    expect(linearTrend(series('2026-01-01', [80]), '2026-01-01')).toBeNull();
    expect(linearTrend([], '2026-01-01')).toBeNull();
  });

  it('kräver ett tillräckligt tidsspann', () => {
    expect(linearTrend(series('2026-01-01', [80, 79]), '2026-01-02')).toBeNull();
  });

  it('anpassar en exakt linje', () => {
    const t = linearTrend(
      series('2026-01-01', [80, 79.9, 79.8, 79.7, 79.6, 79.5, 79.4, 79.3]),
      '2026-01-08',
    );
    expect(t?.slopeKgPerDay).toBeCloseTo(-0.1);
    expect(t?.fittedKg).toBeCloseTo(79.3);
    expect(t?.lastDate).toBe('2026-01-08');
  });

  it('använder bara fönstret och klarar luckor', () => {
    const daily = [
      { date: '2025-10-01', weightKg: 100, count: 1 }, // utanför fönstret
      { date: '2026-01-01', weightKg: 80, count: 1 },
      { date: '2026-01-15', weightKg: 79, count: 1 },
    ];
    const t = linearTrend(daily, '2026-01-15');
    expect(t?.slopeKgPerDay).toBeCloseTo(-1 / 14);
  });
});

describe('forecastGoal', () => {
  const start = '2026-01-01';
  /** En vägning var `step`:e dag från start: startvikt + takt per dag + valfritt brus. */
  interface SeriesOptions {
    fromKg?: number;
    kgPerDay?: number;
    step?: number;
    noise?: (i: number) => number;
  }
  function weighIns(
    count: number,
    { fromKg = 95, kgPerDay = -0.07, step = 1, noise = () => 0 }: SeriesOptions = {},
  ): DailyWeight[] {
    return Array.from({ length: count }, (_, i) => ({
      date: addDays(start, i * step),
      weightKg: fromKg + kgPerDay * i * step + noise(i),
      count: 1,
    }));
  }

  it('snabb tidig nedgång dag 1–14: ingen trendprognos (plan visas)', () => {
    // −0,4 kg/dag = −2,8 kg/vecka de första två veckorna.
    const daily = weighIns(14, { kgPerDay: -0.4 });
    const f = forecastGoal({
      daily,
      goalKg: 80,
      today: addDays(start, 13),
      startDate: start,
      rateKg: 0.5,
    });
    expect(f).toEqual({ kind: 'insufficient-data', reason: 'early' });
  });

  it('kräver minst 12 vägningar även efter 21 dagar', () => {
    const daily = weighIns(8, { step: 4 }); // dag 0–28, 8 vägningar
    expect(
      forecastGoal({ daily, goalKg: 85, today: addDays(start, 30), startDate: start }),
    ).toEqual({ kind: 'insufficient-data', reason: 'few-weigh-ins' });
    expect(
      forecastGoal({ daily: [], goalKg: 85, today: addDays(start, 30), startDate: start }),
    ).toEqual({ kind: 'insufficient-data', reason: 'few-weigh-ins' });
  });

  it('räknar från första vägningen utan startdatum', () => {
    const daily = weighIns(14);
    expect(forecastGoal({ daily, goalKg: 85, today: addDays(start, 13) })).toEqual({
      kind: 'insufficient-data',
      reason: 'early',
    });
  });

  it('dag 30 med stabil takt: regressionsprognos på trendvikten', () => {
    // −0,07 kg/dag ≈ −0,5 kg/vecka, en vägning per dag.
    const daily = weighIns(31);
    const today = addDays(start, 30);
    const f = forecastGoal({ daily, goalKg: 85, today, startDate: start, rateKg: 0.5 });
    expect(f).toMatchObject({ kind: 'forecast', capped: false, range: null });
    if (f.kind !== 'forecast') return;
    expect(f.weeklyChangeKg).toBeCloseTo(-0.49, 1);
    expect(f.weeklyChangeKg).toBe(f.measuredWeeklyChangeKg);
    // Från trendvikten: datumet = idag + kvar ÷ takt.
    const trendKg = emaTrend(daily).at(-1)?.trendKg ?? NaN;
    const fromTrend = forecastGoal({ daily, goalKg: 85, today, startDate: start, fromKg: trendKg });
    const days = Math.ceil(((trendKg - 85) / -f.weeklyChangeKg) * 7);
    expect(fromTrend).toMatchObject({ kind: 'forecast', date: addDays(today, days) });
  });

  it('exkluderar de första 14 dagarna (vätskefasen) ur takten', () => {
    // Dag 0–13: −0,4 kg/dag (−2,8 kg/vecka), därefter stilla.
    const early = weighIns(14, { kgPerDay: -0.4 });
    const later = Array.from({ length: 17 }, (_, i) => ({
      date: addDays(start, 14 + i),
      weightKg: 95 - 0.4 * 14,
      count: 1,
    }));
    const input = { daily: [...early, ...later], goalKg: 80, today: addDays(start, 30), rateKg: 5 };
    const f = forecastGoal({ ...input, startDate: start });
    // Samma vägningar om starten låg två veckor tidigare: dag 3–13 kommer med i fönstret.
    const unfiltered = forecastGoal({ ...input, startDate: addDays(start, -14) });
    expect(f.kind).toBe('forecast');
    expect(unfiltered.kind).toBe('forecast');
    if (f.kind === 'forecast' && unfiltered.kind === 'forecast') {
      expect(f.measuredWeeklyChangeKg).toBeGreaterThan(unfiltered.measuredWeeklyChangeKg + 0.3);
    }
  });

  it('takt över taket: prognosen räknar med det högsta av vald takt och 1 % av trendvikten', () => {
    // −0,2 kg/dag = −1,4 kg/vecka från 100 kg; taket = max(0,5; 1 % av ~93 kg) ≈ 0,93 kg/vecka.
    const daily = weighIns(36, { fromKg: 100, kgPerDay: -0.2 });
    const today = addDays(start, 35);
    const f = forecastGoal({ daily, goalKg: 80, today, startDate: start, rateKg: 0.5 });
    expect(f).toMatchObject({ kind: 'forecast', capped: true });
    if (f.kind !== 'forecast') return;
    const trendKg = emaTrend(daily).at(-1)?.trendKg ?? NaN;
    expect(f.weeklyChangeKg).toBeCloseTo(-0.01 * trendKg);
    expect(f.measuredWeeklyChangeKg).toBeLessThan(-1.2);
    expect(f.date).toBe(addDays(today, Math.ceil(((trendKg - 80) / (0.01 * trendKg)) * 7)));

    // En vald takt över 1 % höjer taket: 1,2 kg/vecka.
    const faster = forecastGoal({ daily, goalKg: 80, today, startDate: start, rateKg: 1.2 });
    expect(faster).toMatchObject({ kind: 'forecast', capped: true });
    if (faster.kind === 'forecast') expect(faster.weeklyChangeKg).toBeCloseTo(-1.2);
  });

  it('stor spridning: intervall i stället för ett datum', () => {
    // Var annan dag, ±2 kg i block om två vägningar runt −0,5 kg/vecka.
    const noise = (i: number) => (i % 4 < 2 ? 2 : -2);
    const daily = weighIns(20, { step: 2, noise });
    const today = addDays(start, 38);
    const f = forecastGoal({ daily, goalKg: 85, today, startDate: start, rateKg: 0.5 });
    expect(f.kind).toBe('forecast');
    if (f.kind !== 'forecast') return;
    expect(f.range).not.toBeNull();
    if (!f.range) return;
    expect(f.range.from < f.date).toBe(true);
    expect(f.range.to > f.date).toBe(true);
    expect(f.range.from.slice(0, 7)).not.toBe(f.range.to.slice(0, 7));

    // Liten spridning: ett datum.
    const calm = forecastGoal({
      daily: weighIns(20, { step: 2, noise: (i) => (i % 4 < 2 ? 0.2 : -0.2) }),
      goalKg: 85,
      today,
      startDate: start,
      rateKg: 0.5,
    });
    expect(calm).toMatchObject({ kind: 'forecast', range: null });
  });

  it('jämför med måldatum', () => {
    const daily = weighIns(31);
    const today = addDays(start, 30);
    const f = forecastGoal({ daily, goalKg: 85, today, startDate: start, goalDate: '2026-04-01' });
    expect(f.kind).toBe('forecast');
    if (f.kind === 'forecast') expect(f.daysVsGoalDate).toBe(daysBetween('2026-04-01', f.date));
  });

  it('säger ifrån när trenden går åt fel håll eller står still', () => {
    const today = addDays(start, 30);
    const rising = weighIns(31, { kgPerDay: 0.05 });
    expect(forecastGoal({ daily: rising, goalKg: 85, today, startDate: start }).kind).toBe(
      'not-progressing',
    );
    const flat = weighIns(31, { kgPerDay: 0 });
    expect(forecastGoal({ daily: flat, goalKg: 85, today, startDate: start }).kind).toBe(
      'not-progressing',
    );
  });

  it('säger att målet är nått när vikten ligger på målet', () => {
    const daily = weighIns(31);
    const today = addDays(start, 30);
    expect(forecastGoal({ daily, goalKg: 92.9, today, startDate: start, fromKg: 92.9 }).kind).toBe(
      'reached',
    );
  });

  it('utgår från en angiven vikt med linjens takt', () => {
    const daily = weighIns(31);
    const today = addDays(start, 30);
    const a = forecastGoal({ daily, goalKg: 85, today, startDate: start, fromKg: 93 });
    const b = forecastGoal({ daily, goalKg: 85, today, startDate: start, fromKg: 92 });
    expect(a.kind === 'forecast' && b.kind === 'forecast' && a.date > b.date).toBe(true);
  });
});

describe('filterRange', () => {
  const items = [
    { date: '2025-09-01' },
    { date: '2026-07-01' },
    { date: '2026-08-27' },
    { date: '2026-09-25' },
  ];

  it('filtrerar senaste månaden och tre månaderna', () => {
    expect(filterRange(items, '1m', '2026-09-25').map((i) => i.date)).toEqual([
      '2026-08-27',
      '2026-09-25',
    ]);
    expect(filterRange(items, '3m', '2026-09-25')).toHaveLength(3);
  });

  it('visar allt', () => {
    expect(filterRange(items, 'all', '2026-09-25')).toHaveLength(4);
  });
});

describe('dailySteps', () => {
  it('hoppar över mätningar utan steg och tar senaste värdet samma dag', () => {
    const result = dailySteps([
      { date: '2026-01-02', steps: 4000, createdAt: 1 },
      { date: '2026-01-02', steps: 9000, createdAt: 3 },
      { date: '2026-01-02', createdAt: 4 },
      { date: '2026-01-01', steps: 7000, createdAt: 2 },
    ]);
    expect(result).toEqual([
      { date: '2026-01-01', steps: 7000 },
      { date: '2026-01-02', steps: 9000 },
    ]);
  });

  it('ger tom lista utan steg', () => {
    expect(dailySteps([{ date: '2026-01-01', createdAt: 1 }])).toEqual([]);
  });
});
