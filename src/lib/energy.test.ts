import { describe, expect, it } from 'vitest';
import {
  CALORIE_FLOOR,
  activityFactor,
  ageFromBirthYear,
  bmrMifflinStJeor,
  caloriePlan,
  checkGoalDate,
  deficitForRate,
  energyProfileFrom,
  maxRateKg,
  rateForDeficit,
  type EnergyProfile,
} from './energy.ts';

const TODAY = '2026-09-25';

/** Man, 40 år, 180 cm, måttligt aktiv, 0,5 kg/vecka mot 80 kg. */
const man: EnergyProfile = {
  sex: 'man',
  birthYear: 1986,
  heightCm: 180,
  activityLevel: 'mattlig',
  ratePerWeekKg: 0.5,
  goalWeightKg: 80,
};

describe('BMR och TDEE', () => {
  it('räknar Mifflin-St Jeor för män och kvinnor', () => {
    // 10·90 + 6,25·180 − 5·40 + 5
    expect(bmrMifflinStJeor('man', 90, 180, 40)).toBe(1830);
    // 10·70 + 6,25·165 − 5·30 − 161
    expect(bmrMifflinStJeor('kvinna', 70, 165, 30)).toBeCloseTo(1420.25);
  });

  it('har aktivitetsfaktorer i stigande ordning', () => {
    expect(activityFactor('stillasittande')).toBe(1.2);
    expect(activityFactor('latt')).toBe(1.375);
    expect(activityFactor('mattlig')).toBe(1.55);
    expect(activityFactor('aktiv')).toBe(1.725);
  });

  it('räknar ålder på kalenderår', () => {
    expect(ageFromBirthYear(1986, TODAY)).toBe(40);
    expect(ageFromBirthYear(1986, '2026-01-01')).toBe(40);
  });

  it('underskott och takt är varandras inverser (7 700 kcal/kg)', () => {
    expect(deficitForRate(0.5)).toBe(550);
    expect(deficitForRate(1)).toBe(1100);
    expect(rateForDeficit(550)).toBeCloseTo(0.5);
  });
});

describe('maxRateKg', () => {
  it('är 1 % av trendvikten men högst 1 kg/vecka', () => {
    expect(maxRateKg(70)).toBeCloseTo(0.7);
    expect(maxRateKg(100)).toBe(1);
    expect(maxRateKg(140)).toBe(1);
  });
});

describe('caloriePlan', () => {
  it('kalorimål = TDEE − takt × 7 700 / 7', () => {
    const plan = caloriePlan({ profile: man, trendKg: 90, today: TODAY });
    expect(plan.ageYears).toBe(40);
    expect(plan.bmr).toBe(1830);
    expect(plan.formulaTdee).toBeCloseTo(2836.5);
    expect(plan.tdee).toBe(plan.formulaTdee);
    expect(plan.deficitKcal).toBeCloseTo(550);
    expect(plan.targetKcal).toBe(2287);
    expect(plan.rateKg).toBe(0.5);
    expect(plan.limits).toEqual([]);
    // 10 kg / 0,5 kg per vecka = 20 veckor = 140 dagar.
    expect(plan.forecastDate).toBe('2027-02-12');
    expect(plan.goalDateCheck).toEqual({ kind: 'none' });
  });

  it('använder en skattad TDEE när den finns', () => {
    const plan = caloriePlan({ profile: man, trendKg: 90, today: TODAY, tdeeOverride: 2500 });
    expect(plan.tdee).toBe(2500);
    expect(plan.targetKcal).toBe(1950);
    expect(plan.formulaTdee).toBeCloseTo(2836.5);
  });

  it('spärr: takten sänks till 1 % av trendvikten', () => {
    const plan = caloriePlan({
      profile: { ...man, ratePerWeekKg: 1, goalWeightKg: 60 },
      trendKg: 70,
      today: TODAY,
    });
    expect(plan.limits).toEqual(['rate-capped']);
    expect(plan.chosenRateKg).toBe(1);
    expect(plan.rateKg).toBeCloseTo(0.7);
    expect(plan.deficitKcal).toBeCloseTo(770);
  });

  it('spärr: 1 kg/vecka tillåts först från 100 kg trendvikt', () => {
    const heavy = caloriePlan({
      profile: { ...man, ratePerWeekKg: 1 },
      trendKg: 120,
      today: TODAY,
    });
    expect(heavy.limits).toEqual([]);
    expect(heavy.rateKg).toBe(1);
    expect(heavy.deficitKcal).toBeCloseTo(1100);
  });

  it('spärr: kalorimålet går aldrig under 1 200 kcal för kvinnor', () => {
    // BMR = 600 + 1000 − 250 − 161 = 1189, TDEE = 1426,8.
    const plan = caloriePlan({
      profile: {
        sex: 'kvinna',
        birthYear: 1976,
        heightCm: 160,
        activityLevel: 'stillasittande',
        ratePerWeekKg: 0.5,
        goalWeightKg: 55,
      },
      trendKg: 60,
      today: TODAY,
    });
    expect(plan.formulaTdee).toBeCloseTo(1426.8);
    expect(plan.limits).toEqual(['calorie-floor']);
    expect(plan.targetKcal).toBe(CALORIE_FLOOR.kvinna);
    expect(plan.deficitKcal).toBeCloseTo(226.8);
    expect(plan.rateKg).toBeCloseTo((226.8 * 7) / 7700);
  });

  it('spärr: kalorimålet går aldrig under 1 500 kcal för män', () => {
    const plan = caloriePlan({
      profile: { ...man, activityLevel: 'stillasittande', goalWeightKg: 55 },
      trendKg: 62,
      today: TODAY,
      tdeeOverride: 1600,
    });
    expect(plan.targetKcal).toBe(1500);
    expect(plan.limits).toContain('calorie-floor');
    expect(plan.deficitKcal).toBeCloseTo(100);
  });

  it('TDEE under golvet: målet blir golvet, takten 0 och ingen prognos', () => {
    const plan = caloriePlan({
      profile: { ...man, sex: 'kvinna' },
      trendKg: 90,
      today: TODAY,
      tdeeOverride: 1100,
    });
    expect(plan.targetKcal).toBe(1200);
    expect(plan.rateKg).toBe(0);
    expect(plan.forecastDate).toBeNull();
  });

  it('kan ge både takt- och golvspärr samtidigt', () => {
    const plan = caloriePlan({
      profile: { ...man, sex: 'kvinna', ratePerWeekKg: 1, goalWeightKg: 50 },
      trendKg: 60,
      today: TODAY,
      tdeeOverride: 1600,
    });
    expect(plan.limits).toEqual(['rate-capped', 'calorie-floor']);
    expect(plan.targetKcal).toBe(1200);
  });

  it('målet nått: underhåll', () => {
    const plan = caloriePlan({ profile: man, trendKg: 79.96, today: TODAY });
    expect(plan.limits).toEqual(['goal-reached']);
    expect(plan.targetKcal).toBe(Math.round(plan.tdee));
    expect(plan.rateKg).toBe(0);
    expect(plan.remainingKg).toBe(0);
    expect(plan.forecastDate).toBeNull();
  });

  it('takt 0 (håll vikten): kalorimålet är TDEE, ingen prognos och ingen måldatumskontroll', () => {
    const plan = caloriePlan({
      profile: { ...man, ratePerWeekKg: 0, goalDate: '2026-12-01' },
      trendKg: 90,
      today: TODAY,
    });
    expect(plan.limits).toEqual(['maintenance']);
    expect(plan.targetKcal).toBe(Math.round(plan.tdee));
    expect(plan.rateKg).toBe(0);
    expect(plan.deficitKcal).toBe(0);
    expect(plan.forecastDate).toBeNull();
    expect(plan.goalDateCheck).toEqual({ kind: 'none' });
  });

  it('under målvikten: också underhåll', () => {
    expect(caloriePlan({ profile: man, trendKg: 75, today: TODAY }).limits).toEqual([
      'goal-reached',
    ]);
  });

  describe('måldatum', () => {
    it('orimligt måldatum: varning med tidigaste rimliga datum, underskottet höjs inte', () => {
      const without = caloriePlan({ profile: man, trendKg: 90, today: TODAY });
      // 6 veckor för 10 kg kräver 1,67 kg/vecka; max är 0,9 (1 % av 90).
      const plan = caloriePlan({
        profile: { ...man, goalDate: '2026-11-06' },
        trendKg: 90,
        today: TODAY,
      });
      expect(plan.goalDateCheck.kind).toBe('unrealistic');
      if (plan.goalDateCheck.kind !== 'unrealistic') return;
      expect(plan.goalDateCheck.requiredRateKg).toBeCloseTo(10 / 6);
      // 10 / 0,9 veckor = 77,8 dagar → 78 dagar.
      expect(plan.goalDateCheck.earliestDate).toBe('2026-12-12');
      expect(plan.targetKcal).toBe(without.targetKcal);
      expect(plan.rateKg).toBe(without.rateKg);
    });

    it('måldatum som kräver snabbare takt än vald men inom spärrarna', () => {
      const plan = caloriePlan({
        profile: { ...man, goalDate: '2027-01-03' }, // 100 dagar
        trendKg: 90,
        today: TODAY,
      });
      expect(plan.goalDateCheck).toEqual({ kind: 'needs-faster', requiredRateKg: 0.7 });
    });

    it('måldatum som nås med vald takt', () => {
      const plan = caloriePlan({
        profile: { ...man, goalDate: '2027-04-13' }, // 200 dagar
        trendKg: 90,
        today: TODAY,
      });
      expect(plan.goalDateCheck).toEqual({ kind: 'ok', requiredRateKg: 0.35 });
    });

    it('passerat måldatum', () => {
      const plan = caloriePlan({ profile: { ...man, goalDate: TODAY }, trendKg: 90, today: TODAY });
      expect(plan.goalDateCheck).toEqual({ kind: 'passed' });
    });

    it('tidigaste datum tar hänsyn till kaloriegolvet', () => {
      // TDEE 1426,8, golv 1200 → högst 226,8 kcal/dag ≈ 0,206 kg/vecka.
      const plan = caloriePlan({
        profile: {
          sex: 'kvinna',
          birthYear: 1976,
          heightCm: 160,
          activityLevel: 'stillasittande',
          ratePerWeekKg: 0.5,
          goalWeightKg: 55,
          goalDate: '2026-12-25',
        },
        trendKg: 60,
        today: TODAY,
      });
      expect(plan.goalDateCheck.kind).toBe('unrealistic');
      if (plan.goalDateCheck.kind !== 'unrealistic') return;
      const weeks = 5 / ((226.8 * 7) / 7700);
      expect(plan.goalDateCheck.earliestDate).toBe(plan.forecastDate);
      expect(Math.ceil(weeks * 7)).toBe(170);
    });

    it('utan möjligt underskott finns inget tidigaste datum', () => {
      expect(
        checkGoalDate({
          goalDate: '2027-01-01',
          today: TODAY,
          remainingKg: 5,
          rateKg: 0,
          maxRateKg: 0,
        }),
      ).toMatchObject({ kind: 'unrealistic', earliestDate: null });
    });
  });
});

describe('energyProfileFrom', () => {
  const base = { heightCm: 180, goalWeightKg: 80 };

  it('kräver kön, födelseår och aktivitetsnivå', () => {
    expect(energyProfileFrom(base)).toBeNull();
    expect(energyProfileFrom({ ...base, sex: 'man', birthYear: 1980 })).toBeNull();
  });

  it('använder 0,5 kg/vecka som standardtakt', () => {
    expect(
      energyProfileFrom({ ...base, sex: 'man', birthYear: 1980, activityLevel: 'latt' }),
    ).toMatchObject({ ratePerWeekKg: 0.5 });
  });
});
