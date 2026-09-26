import { describe, expect, it } from 'vitest';
import { dailyWater, defaultWaterGoalMl, waterGoal, waterOn } from './water.ts';

describe('vattenmål', () => {
  it('33 ml per kg, avrundat till närmaste 100 ml', () => {
    expect(defaultWaterGoalMl(80)).toBe(2600); // 2 640
    expect(defaultWaterGoalMl(90)).toBe(3000); // 2 970
    expect(defaultWaterGoalMl(75.5)).toBe(2500); // 2 491,5
    expect(defaultWaterGoalMl(62)).toBe(2000); // 2 046
    expect(defaultWaterGoalMl(84.85)).toBe(2800); // 2 800,05
  });

  it('räknas från trendvikten, inte senaste mätningen', () => {
    const weights = [
      { date: '2026-09-01', weightKg: 90 },
      { date: '2026-09-02', weightKg: 80 },
    ];
    // EMA (alpha 0,1): 90 → 89. 89 × 33 = 2 937 → 2 900.
    const goal = waterGoal({ weights, profile: { startWeightKg: 95 } });
    expect(goal).toEqual({ ml: 2900, source: 'trend', basisKg: 89 });
  });

  it('eget mål i profilen går före', () => {
    const goal = waterGoal({
      weights: [{ date: '2026-09-01', weightKg: 90 }],
      profile: { startWeightKg: 95, waterGoalMl: 2000 },
    });
    expect(goal).toEqual({ ml: 2000, source: 'egen' });
  });

  it('utan mätningar används startvikten, utan profil finns inget mål', () => {
    expect(waterGoal({ weights: [], profile: { startWeightKg: 70 } })).toEqual({
      ml: 2300,
      source: 'startvikt',
      basisKg: 70,
    });
    expect(waterGoal({ weights: [], profile: null })).toBeNull();
  });
});

describe('vatten per dag', () => {
  const entries = [
    { date: '2026-09-02', ml: 500 },
    { date: '2026-09-01', ml: 250 },
    { date: '2026-09-02', ml: 250 },
  ];

  it('summerar per dag, äldst först', () => {
    expect(dailyWater(entries)).toEqual([
      { date: '2026-09-01', ml: 250, count: 1 },
      { date: '2026-09-02', ml: 750, count: 2 },
    ]);
  });

  it('summa för en dag', () => {
    expect(waterOn(entries, '2026-09-02')).toBe(750);
    expect(waterOn(entries, '2026-09-03')).toBe(0);
  });
});
