import { describe, expect, it } from 'vitest';
import { addDays } from './dates.ts';
import { goalEta, overviewStats } from './overview.ts';
import { bmi, forecastGoal, goalProgress, type DailyWeight } from './stats.ts';

const profile = {
  startWeightKg: 90,
  goalWeightKg: 80,
  heightCm: 180,
  startDate: '2026-01-01',
  ratePerWeekKg: 0.5,
};
const today = '2026-02-14';
// Varannan dag ≈ −0,5 kg/vecka i sex veckor med en vätskedipp sist.
const daily: DailyWeight[] = [
  ...Array.from({ length: 22 }, (_, i) => ({
    date: addDays('2026-01-01', i * 2),
    weightKg: 90 - i * 0.14,
    count: 1,
  })),
  { date: today, weightKg: 86, count: 1 },
];
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
  it('förändring, kvar, %, BMI och prognos räknas alla på senaste dagsvikten', () => {
    const s = overviewStats({ profile, daily, today });
    expect(s.latestDate).toBe(today);
    expect(s.weightKg).toBe(dailyKg);
    expect({ progress: s.progress, bmi: s.bmi, forecast: s.forecast }).toEqual(
      derivedFrom(dailyKg),
    );
    expect(s.progress.changeKg).toBeCloseTo(-4);
    expect(s.progress.remainingKg).toBeCloseTo(6);
    expect(s.progress.fraction).toBeCloseTo(0.4);
    expect(s.forecast.kind).toBe('forecast');
  });

  it('utan vägning används startvikten', () => {
    const s = overviewStats({ profile, daily: [], today });
    expect(s.weightKg).toBe(90);
    expect(s.latestDate).toBeNull();
    expect(s.progress).toMatchObject({ changeKg: 0, fraction: 0, remainingKg: 10 });
    expect(s.forecast).toEqual({ kind: 'insufficient-data', reason: 'few-weigh-ins' });
  });
});

describe('goalEta', () => {
  const progress = goalProgress(90, 86, 80);

  it('prognos ur vägningarna när takten leder mot målet', () => {
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
      kind: 'forecast',
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
    expect(eta).toMatchObject({ kind: 'forecast', range, capped: true, weeklyChangeKg: -0.9 });
  });

  it('snabb tidig nedgång (dag 1–14): ingen prognos ur vägningarna, datum enligt plan', () => {
    // −0,4 kg/dag i två veckor (−2,8 kg/vecka extrapolerat).
    const early: DailyWeight[] = Array.from({ length: 14 }, (_, i) => ({
      date: addDays('2026-01-01', i),
      weightKg: 90 - 0.4 * i,
      count: 1,
    }));
    const day14 = '2026-01-14';
    const stats = overviewStats({ profile, daily: early, today: day14 });
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

  it('vikten går inte mot målet: enligt plan, aldrig två motsägande datum', () => {
    const eta = goalEta({
      stats: { progress, forecast: { kind: 'not-progressing', weeklyChangeKg: 0.2 } },
      today,
      rateKg: 1,
    });
    expect(eta).toMatchObject({ kind: 'plan', reason: 'not-progressing' });
  });

  it('takt 0 utan prognos: inget datum; nått mål: reached', () => {
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
