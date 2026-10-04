import { describe, expect, it } from 'vitest';
import { addDays } from './dates.ts';
import { goalEta, overviewStats } from './overview.ts';
import { bmi, emaTrend, forecastGoal, goalProgress, type DailyWeight } from './stats.ts';

const profile = {
  startWeightKg: 90,
  goalWeightKg: 80,
  heightCm: 180,
  startDate: '2026-01-01',
  ratePerWeekKg: 0.5,
};
const today = '2026-02-14';
// Varannan dag ≈ −0,5 kg/vecka i sex veckor med en vätskedipp sist: dagsvikt och trend skiljer sig.
const daily: DailyWeight[] = [
  ...Array.from({ length: 22 }, (_, i) => ({
    date: addDays('2026-01-01', i * 2),
    weightKg: 90 - i * 0.14,
    count: 1,
  })),
  { date: today, weightKg: 86, count: 1 },
];
const trendKg = emaTrend(daily).at(-1)?.trendKg ?? NaN;
const dailyKg = 86;

/** Alla härledda värden räknade på en given vikt. */
function derivedFrom(weightKg: number) {
  return {
    progress: goalProgress(profile.startWeightKg, weightKg, profile.goalWeightKg),
    bmi: bmi(weightKg, profile.heightCm),
    forecast: forecastGoal({
      daily,
      goalKg: profile.goalWeightKg,
      today,
      startDate: profile.startDate,
      rateKg: profile.ratePerWeekKg,
      fromKg: weightKg,
    }),
  };
}

describe('overviewStats', () => {
  it('förutsättning: trend och dagsvikt skiljer sig', () => {
    expect(Math.abs(trendKg - dailyKg)).toBeGreaterThan(0.5);
  });

  it('trendläge: förändring, kvar, %, BMI och prognos räknas alla på trendvikten', () => {
    const s = overviewStats({ profile, daily, today, preferTrend: true });
    expect(s.source).toBe('trend');
    expect(s.weightKg).toBeCloseTo(trendKg);
    expect(s.trendKg).toBeCloseTo(trendKg);
    expect(s.dailyKg).toBe(dailyKg);
    expect({ progress: s.progress, bmi: s.bmi, forecast: s.forecast }).toEqual(
      derivedFrom(trendKg),
    );
    // Förändring mot startvikten.
    expect(s.progress.changeKg).toBeCloseTo(trendKg - 90);
    expect(s.progress.remainingKg).toBeCloseTo(trendKg - 80);
    expect(s.progress.fraction).toBeCloseTo((90 - trendKg) / 10);
  });

  it('dagsläge: förändring, kvar, %, BMI och prognos räknas alla på dagsvikten', () => {
    const s = overviewStats({ profile, daily, today, preferTrend: false });
    expect(s.source).toBe('dag');
    expect(s.weightKg).toBe(dailyKg);
    expect({ progress: s.progress, bmi: s.bmi, forecast: s.forecast }).toEqual(
      derivedFrom(dailyKg),
    );
    expect(s.progress.changeKg).toBeCloseTo(-4);
    expect(s.progress.remainingKg).toBeCloseTo(6);
    expect(s.progress.fraction).toBeCloseTo(0.4);
    expect(s.forecast.kind).toBe('forecast');
  });

  it('prognosen utgår från samma vikt: trenden ligger högre och når målet senare', () => {
    const trend = overviewStats({ profile, daily, today, preferTrend: true }).forecast;
    const day = overviewStats({ profile, daily, today, preferTrend: false }).forecast;
    expect(trend.kind).toBe('forecast');
    expect(day.kind).toBe('forecast');
    if (trend.kind === 'forecast' && day.kind === 'forecast') {
      expect(trend.weeklyChangeKg).toBeCloseTo(day.weeklyChangeKg);
      expect(trend.date > day.date).toBe(true);
    }
  });

  it('utan vägning används startvikten i båda lägena', () => {
    for (const preferTrend of [true, false]) {
      const s = overviewStats({ profile, daily: [], today, preferTrend });
      expect(s.source).toBe('dag');
      expect(s.weightKg).toBe(90);
      expect(s.trendKg).toBeNull();
      expect(s.progress).toMatchObject({ changeKg: 0, fraction: 0, remainingKg: 10 });
      expect(s.forecast).toEqual({ kind: 'insufficient-data', reason: 'few-weigh-ins' });
    }
  });
});

describe('goalEta', () => {
  const progress = goalProgress(90, 86, 80);

  it('trendbaserad prognos när trenden leder mot målet', () => {
    const eta = goalEta({
      stats: {
        progress,
        forecast: {
          kind: 'forecast',
          date: '2026-05-01',
          range: null,
          weeklyChangeKg: -0.6,
          measuredWeeklyChangeKg: -0.6,
          capped: false,
          daysVsGoalDate: null,
        },
      },
      today,
      rateKg: 0.5,
      planDate: '2026-04-01',
    });
    expect(eta).toEqual({
      kind: 'trend',
      date: '2026-05-01',
      range: null,
      weeklyChangeKg: -0.6,
      capped: false,
    });
  });

  it('för med intervall och tak från prognosen', () => {
    const range = { from: '2026-03-10', to: '2026-05-20' };
    const eta = goalEta({
      stats: {
        progress,
        forecast: {
          kind: 'forecast',
          date: '2026-04-10',
          range,
          weeklyChangeKg: -0.9,
          measuredWeeklyChangeKg: -1.6,
          capped: true,
          daysVsGoalDate: null,
        },
      },
      today,
      rateKg: 0.5,
    });
    expect(eta).toMatchObject({ kind: 'trend', range, capped: true, weeklyChangeKg: -0.9 });
  });

  it('snabb tidig nedgång (dag 1–14): ingen trendprognos, datum enligt plan', () => {
    // −0,4 kg/dag i två veckor (−2,8 kg/vecka extrapolerat).
    const early: DailyWeight[] = Array.from({ length: 14 }, (_, i) => ({
      date: addDays('2026-01-01', i),
      weightKg: 90 - 0.4 * i,
      count: 1,
    }));
    const day14 = '2026-01-14';
    const stats = overviewStats({ profile, daily: early, today: day14, preferTrend: true });
    expect(stats.forecast).toEqual({ kind: 'insufficient-data', reason: 'early' });
    const eta = goalEta({ stats, today: day14, rateKg: 0.5 });
    expect(eta).toMatchObject({ kind: 'plan', rateKg: 0.5, reason: 'early' });
  });

  it('för lite data: datum enligt vald takt (kalorimålets datum om det finns)', () => {
    const stats = {
      progress,
      forecast: { kind: 'insufficient-data', reason: 'few-weigh-ins' } as const,
    };
    expect(goalEta({ stats, today, rateKg: 0.5, planDate: '2026-04-01' })).toEqual({
      kind: 'plan',
      date: '2026-04-01',
      rateKg: 0.5,
      reason: 'few-weigh-ins',
    });
    // 6 kg kvar i 0,5 kg/vecka = 12 veckor.
    expect(goalEta({ stats, today, rateKg: undefined })).toEqual({
      kind: 'plan',
      date: addDays(today, 84),
      rateKg: 0.5,
      reason: 'few-weigh-ins',
    });
  });

  it('trenden leder inte mot målet: enligt plan, aldrig två motsägande datum', () => {
    const eta = goalEta({
      stats: { progress, forecast: { kind: 'not-progressing', weeklyChangeKg: 0.2 } },
      today,
      rateKg: 1,
    });
    expect(eta).toMatchObject({ kind: 'plan', reason: 'not-progressing' });
  });

  it('takt 0 utan trend: inget datum; nått mål: reached', () => {
    const stats = { progress, forecast: { kind: 'insufficient-data', reason: 'early' } as const };
    expect(goalEta({ stats, today, rateKg: 0 })).toBeNull();
    expect(
      goalEta({
        stats: { progress: goalProgress(90, 80, 80), forecast: stats.forecast },
        today,
        rateKg: 0.5,
      }),
    ).toEqual({ kind: 'reached' });
  });
});
