import { describe, expect, it } from 'vitest';
import { addDays } from './dates.ts';
import { buildPlan } from './plan.ts';

const TODAY = '2026-09-25';
const profile = {
  startWeightKg: 92,
  heightCm: 180,
  goalWeightKg: 80,
  sex: 'man' as const,
  birthYear: 1986,
  activityLevel: 'mattlig' as const,
  ratePerWeekKg: 0.5,
};

describe('buildPlan', () => {
  it('kräver kön, födelseår och aktivitetsnivå', () => {
    expect(buildPlan({ ...profile, sex: undefined }, [], [], TODAY)).toEqual({
      kind: 'incomplete-profile',
    });
  });

  it('använder startvikten utan mätningar och formeln utan matlogg', () => {
    const result = buildPlan(profile, [], [], TODAY);
    if (result.kind !== 'plan') throw new Error('väntade plan');
    expect(result.trendKg).toBe(92);
    expect(result.adaptive.kind).toBe('formula');
    expect(result.plan.tdee).toBe(result.plan.formulaTdee);
    expect(result.plan.bmr).toBe(10 * 92 + 6.25 * 180 - 5 * 40 + 5);
  });

  it('använder trendvikten och den adaptiva skattningen när data finns', () => {
    const weights = [];
    const foodLog = [];
    for (let i = 28; i >= 1; i--) {
      const date = addDays(TODAY, -i);
      weights.push({ date, weightKg: 90 - (28 - i) * 0.05 });
      foodLog.push({ date, grams: 100, per100: { kcal: 2200, proteinG: 0, carbsG: 0, fatG: 0 } });
    }
    const result = buildPlan(profile, weights, foodLog, TODAY);
    if (result.kind !== 'plan') throw new Error('väntade plan');
    expect(result.trendKg).toBeLessThan(90);
    expect(result.adaptive.kind).toBe('adaptive');
    if (result.adaptive.kind !== 'adaptive') return;
    // 2 200 + 0,05 × 7 700 = 2 585 kcal.
    expect(result.adaptive.observedTdee).toBeCloseTo(2585, 0);
    expect(result.plan.tdee).toBeCloseTo(result.adaptive.tdee);
  });

  it('bortser från framtida mätningar', () => {
    const result = buildPlan(profile, [{ date: addDays(TODAY, 3), weightKg: 50 }], [], TODAY);
    expect(result.kind === 'plan' && result.trendKg).toBe(92);
  });
});
