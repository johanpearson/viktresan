import { describe, expect, it } from 'vitest';
import { addDays } from './dates.ts';
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
  const falling = series('2026-01-01', [80, 79.3, 78.6], 7); // −0,7 kg/vecka

  it('prognostiserar datum då målet nås', () => {
    const f = forecastGoal({ daily: falling, goalKg: 75.8, today: '2026-01-15' });
    // 78,6 − 75,8 = 2,8 kg à 0,1 kg/dag = 28 dagar efter 15 jan.
    expect(f).toMatchObject({ kind: 'forecast', date: '2026-02-12', daysVsGoalDate: null });
    if (f.kind === 'forecast') expect(f.weeklyChangeKg).toBeCloseTo(-0.7);
  });

  it('jämför med måldatum', () => {
    const f = forecastGoal({
      daily: falling,
      goalKg: 75.8,
      today: '2026-01-15',
      goalDate: '2026-02-01',
    });
    expect(f).toMatchObject({ kind: 'forecast', daysVsGoalDate: 11 });
  });

  it('säger ifrån vid för lite data (en mätning)', () => {
    expect(
      forecastGoal({ daily: series('2026-01-01', [80]), goalKg: 75, today: '2026-01-01' }),
    ).toEqual({
      kind: 'insufficient-data',
    });
  });

  it('säger ifrån när trenden går åt fel håll eller står still', () => {
    const rising = series('2026-01-01', [80, 81, 82], 7);
    expect(forecastGoal({ daily: rising, goalKg: 75, today: '2026-01-15' }).kind).toBe(
      'not-progressing',
    );
    const flat = series('2026-01-01', [80, 80, 80], 7);
    expect(forecastGoal({ daily: flat, goalKg: 75, today: '2026-01-15' }).kind).toBe(
      'not-progressing',
    );
  });

  it('säger att målet är nått när trenden ligger på målet', () => {
    expect(forecastGoal({ daily: falling, goalKg: 78.6, today: '2026-01-15' }).kind).toBe(
      'reached',
    );
  });

  it('räknar inte med mätningar äldre än fönstret', () => {
    const old = series('2025-06-01', [90, 89, 88], 7);
    expect(forecastGoal({ daily: old, goalKg: 80, today: '2026-01-15' }).kind).toBe(
      'insufficient-data',
    );
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
