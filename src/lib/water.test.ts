import { describe, expect, it } from 'vitest';
import {
  dailyWater,
  defaultWaterGoalMl,
  drinkEntries,
  drinkOn,
  foodDrinkMl,
  isAlcoholic,
  waterGoal,
  waterGoalFor,
  waterOn,
} from './water.ts';

describe('dryckesmål', () => {
  it('standardmålet följer kön (EFSA, dryckesdelen): 2 000 ml män, 1 600 ml kvinnor', () => {
    expect(defaultWaterGoalMl('man')).toBe(2000);
    expect(defaultWaterGoalMl('kvinna')).toBe(1600);
    expect(defaultWaterGoalMl(undefined)).toBe(1800);
  });

  it('har ingen koppling till kroppsvikten', () => {
    const light = { sex: 'kvinna' as const, startWeightKg: 55 };
    const heavy = { sex: 'kvinna' as const, startWeightKg: 140 };
    expect(waterGoal({ profile: light }).ml).toBe(1600);
    expect(waterGoal({ profile: heavy }).ml).toBe(1600);
  });

  it('eget mål i profilen går före standardmålet', () => {
    expect(waterGoal({ profile: { sex: 'man', waterGoalMl: 2400 } })).toEqual({
      ml: 2400,
      source: 'egen',
      baseMl: 2400,
      bonusMl: 0,
    });
    expect(waterGoal({ profile: { sex: 'man' } })).toEqual({
      ml: 2000,
      source: 'standard',
      baseMl: 2000,
      bonusMl: 0,
    });
  });

  it('utan profil används standardmålet utan kön', () => {
    expect(waterGoal({ profile: null }).ml).toBe(1800);
  });
});

describe('träningsdagstillägg', () => {
  const workouts = [
    { date: '2026-09-10', status: 'genomford' },
    { date: '2026-09-11', status: 'planerad' },
    { date: '2026-09-12', status: 'hoppad' },
  ];
  const profile = { sex: 'kvinna' as const, waterTrainingBonus: true };

  it('+500 ml en dag med ett genomfört pass', () => {
    expect(waterGoal({ profile, workouts, date: '2026-09-10' })).toEqual({
      ml: 2100,
      source: 'standard',
      baseMl: 1600,
      bonusMl: 500,
    });
  });

  it('inget tillägg för planerade eller hoppade pass, eller dagar utan pass', () => {
    for (const date of ['2026-09-11', '2026-09-12', '2026-09-13']) {
      expect(waterGoal({ profile, workouts, date }).ml).toBe(1600);
    }
  });

  it('bara när inställningen är på', () => {
    const off = { sex: 'kvinna' as const };
    expect(waterGoal({ profile: off, workouts, date: '2026-09-10' }).ml).toBe(1600);
  });

  it('läggs även på ett eget mål', () => {
    const own = { waterGoalMl: 2200, waterTrainingBonus: true };
    expect(waterGoal({ profile: own, workouts, date: '2026-09-10' }).ml).toBe(2700);
  });

  it('waterGoalFor ger målet per datum', () => {
    const goalOn = waterGoalFor({ profile, workouts });
    expect(goalOn('2026-09-10')).toBe(2100);
    expect(goalOn('2026-09-11')).toBe(1600);
  });
});

describe('migrering från 33 ml × trendvikten', () => {
  // Profiler som de sparades av tidigare versioner: det uträknade standardmålet
  // (33 ml × trendvikten) lagrades aldrig, bara ett eget mål.
  it('auto-mål byts mot det nya standardmålet', () => {
    const legacy = { startWeightKg: 110, heightCm: 180, goalWeightKg: 90, sex: 'man' as const };
    // Förut: 33 × 110 = 3 630 → 3 600 ml. Nu: 2 000 ml, oavsett vikten.
    const goal = waterGoal({ profile: legacy });
    expect(goal).toEqual({ ml: 2000, source: 'standard', baseMl: 2000, bonusMl: 0 });
  });

  it('ett manuellt satt mål behålls', () => {
    const legacy = {
      startWeightKg: 110,
      heightCm: 180,
      goalWeightKg: 90,
      sex: 'kvinna' as const,
      waterGoalMl: 3600,
    };
    expect(waterGoal({ profile: legacy })).toEqual({
      ml: 3600,
      source: 'egen',
      baseMl: 3600,
      bonusMl: 0,
    });
  });
});

describe('drycker ur matloggen', () => {
  const entry = (
    name: string,
    grams: number,
    extra: { foodId?: string; per100Unit?: 'ml' } = {},
  ) => ({
    id: name,
    date: '2026-09-10',
    foodId: extra.foodId ?? 'lv:1',
    name,
    grams,
    ...(extra.per100Unit ? { per100Unit: extra.per100Unit } : {}),
  });

  it('mjölk, fil, juice, kaffe och vatten räknas, i ml via densiteten', () => {
    // 2 dl mellanmjölk loggas som 206 g (densitet 1,03).
    expect(foodDrinkMl(entry('Mellanmjölk fett 1,5% berikad', 206))).toBe(200);
    expect(foodDrinkMl(entry('Filmjölk fett 3% berikad', 210))).toBe(200);
    expect(foodDrinkMl(entry('Apelsinjuice drickf.', 200))).toBe(200);
    expect(foodDrinkMl(entry('Kaffe bryggt', 150))).toBe(150);
    expect(foodDrinkMl(entry('Havredryck fett 1,5% berikad', 103))).toBe(100);
    expect(foodDrinkMl(entry('Öl alkoholfri', 330))).toBe(330);
  });

  it('värden per 100 ml (Open Food Facts) räknas direkt i ml', () => {
    const cola = entry('Coca-Cola Zero', 330, { foodId: 'off:5449000131805', per100Unit: 'ml' });
    expect(foodDrinkMl(cola)).toBe(330);
  });

  it('alkohol räknas inte', () => {
    for (const name of [
      'Öl pilsner folköl vol. % 3,5',
      'Öl lättöl vol. % 2,3',
      'Vin rött vol. % 14',
      'Cider vol. % 1',
      'Glögg vin vol. % 10',
      'Whisky vol. % 40',
      'Alkoläsk kolsyrad dryck vol. % 4-5',
      'Kaffedrink Irish coffee m.whiskey vispad grädde',
    ]) {
      expect(isAlcoholic(name), name).toBe(true);
      expect(foodDrinkMl(entry(name, 330)), name).toBeNull();
    }
    // Alkoholfritt och saftglögg räknas.
    expect(isAlcoholic('Öl alkoholfri')).toBe(false);
    expect(foodDrinkMl(entry('Saftglögg', 150))).toBe(150);
    // "riboflavin" är inte vin.
    expect(foodDrinkMl(entry('Soygurt naturell berikad Ca vitD B12 folsyra riboflavin', 105))).toBe(
      100,
    );
  });

  it('mat, kvarg, keso och koncentrat räknas inte', () => {
    expect(foodDrinkMl(entry('Kvarg naturell fett 0,2%', 200))).toBeNull();
    expect(foodDrinkMl(entry('Keso fett 4%', 200))).toBeNull();
    expect(foodDrinkMl(entry('Saft konc.', 40))).toBeNull();
    expect(foodDrinkMl(entry('Knäckebröd fullkorn', 30))).toBeNull();
    expect(foodDrinkMl(entry('Tomatsoppa', 300))).toBeNull();
  });

  it('en dag delas upp i loggat och det som kommer från Mat', () => {
    const water = [
      { date: '2026-09-10', ml: 250 },
      { date: '2026-09-11', ml: 500 },
    ];
    const foodLog = [
      entry('Mellanmjölk fett 1,5% berikad', 206),
      entry('Vin rött vol. % 14', 150),
      entry('Knäckebröd fullkorn', 30),
      { ...entry('Kaffe bryggt', 150), date: '2026-09-11' },
    ];
    const day = drinkOn(water, foodLog, '2026-09-10');
    expect(day).toEqual({
      ml: 450,
      loggedMl: 250,
      foodMl: 200,
      food: [
        {
          id: 'Mellanmjölk fett 1,5% berikad',
          date: '2026-09-10',
          name: 'Mellanmjölk fett 1,5% berikad',
          ml: 200,
        },
      ],
    });
    expect(dailyWater(drinkEntries(water, foodLog))).toEqual([
      { date: '2026-09-10', ml: 450, count: 2 },
      { date: '2026-09-11', ml: 650, count: 2 },
    ]);
  });

  it('poster utan namn (bara näringsvärden) räknas inte', () => {
    expect(foodDrinkMl({ date: '2026-09-10', grams: 200 })).toBeNull();
  });
});

describe('dryck per dag', () => {
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
