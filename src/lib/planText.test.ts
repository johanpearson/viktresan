import { describe, expect, it } from 'vitest';
import type { AdaptiveTdee } from './adaptiveTdee.ts';
import { caloriePlan, type EnergyProfile } from './energy.ts';
import { goalDateText, limitText, tdeeSourceLabel, tdeeSourceText } from './planText.ts';

const TODAY = '2026-09-25';
const man: EnergyProfile = {
  sex: 'man',
  birthYear: 1986,
  heightCm: 180,
  activityLevel: 'mattlig',
  ratePerWeekKg: 1,
  goalWeightKg: 60,
};

describe('planText', () => {
  it('förklarar taktspärren', () => {
    const plan = caloriePlan({ profile: man, trendKg: 70, today: TODAY });
    expect(limitText('rate-capped', plan)).toBe(
      'Vald takt (1 kg/vecka) är snabbare än 1 % av din trendvikt per vecka. Kalorimålet bygger därför på högst 0,7 kg/vecka.',
    );
  });

  it('förklarar kaloriegolvet, även när det inte ger något underskott', () => {
    const plan = caloriePlan({ profile: man, trendKg: 70, today: TODAY, tdeeOverride: 1800 });
    expect(limitText('calorie-floor', plan)).toContain('1 500 kcal per dag');
    expect(limitText('calorie-floor', plan)).toContain('0,27 kg/vecka');
    const none = caloriePlan({ profile: man, trendKg: 70, today: TODAY, tdeeOverride: 1400 });
    expect(limitText('calorie-floor', none)).toContain('hålla vikten');
  });

  it('förklarar ett orimligt måldatum och föreslår tidigaste datum', () => {
    const plan = caloriePlan({
      profile: { ...man, ratePerWeekKg: 0.5, goalWeightKg: 80, goalDate: '2026-11-06' },
      trendKg: 90,
      today: TODAY,
    });
    const text = goalDateText(plan, '2026-11-06');
    expect(text).toContain('1,67 kg/vecka');
    expect(text).toContain('0,9 kg/vecka');
    expect(text).toContain('Underskottet höjs inte');
    expect(text).toMatch(/Tidigaste rimliga datum är omkring 12 dec\.? 2026/);
  });

  it('säger inget om måldatum saknas', () => {
    const plan = caloriePlan({ profile: man, trendKg: 90, today: TODAY });
    expect(goalDateText(plan, undefined)).toBeNull();
  });

  it('beskriver källan för TDEE', () => {
    const formula: AdaptiveTdee = {
      kind: 'formula',
      tdee: 2400,
      from: '2026-09-01',
      to: '2026-09-24',
      windowDays: 24,
      loggedDays: 10,
      bothDays: 9,
      loggedFraction: 10 / 24,
    };
    expect(tdeeSourceLabel(formula)).toBe('Formel');
    expect(tdeeSourceText(formula)).toContain('Hittills: 9 dagar');

    const adaptive: AdaptiveTdee = {
      ...formula,
      kind: 'adaptive',
      tdee: 2500,
      observedTdee: 2600,
      weight: 0.5,
      confidence: 'medel',
      uncertaintyKcal: 123.4,
      averageIntakeKcal: 2100,
      weeklyChangeKg: -0.45,
      clamped: false,
    };
    expect(tdeeSourceLabel(adaptive)).toBe('Loggdata + formel (medel säkerhet)');
    expect(tdeeSourceText(adaptive)).toContain('50 % på din loggdata');
    expect(tdeeSourceText(adaptive)).toContain('±123 kcal');
  });
});
