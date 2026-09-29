import { describe, expect, it } from 'vitest';
import type { ExtraNutrients } from '../data/nutrients.ts';
import type { FoodLogEntry } from '../db/db.ts';
import {
  FIBER_RAMP_DEFAULT_START_G,
  dailyFiber,
  fiberGoal,
  fiberGoalText,
  fiberGoalVisible,
  fiberOfEntries,
  fiberReferenceG,
  isFiberRich,
  rampStartG,
  weeklyFiberGoalG,
} from './fiber.ts';

const TODAY = '2026-09-29';

function entry(
  id: string,
  date: string,
  foodId: string,
  grams: number,
  extra: Partial<FoodLogEntry> = {},
): FoodLogEntry {
  return {
    id,
    date,
    meal: 'lunch',
    foodId,
    name: id,
    amount: grams,
    unit: 'g',
    grams,
    per100: { kcal: 200, proteinG: 5, carbsG: 30, fatG: 5 },
    createdAt: 1,
    ...extra,
  };
}

const EXTRA: Record<string, ExtraNutrients> = {
  'lv:1': { fiberG: 10 },
  'lv:2': { fiberG: 2 },
  'off:123': { fiberG: 6 },
  'lv:3': { vitaminC: 10 },
};
const source = { meals: [], lookup: (id: string) => EXTRA[id] };

describe('referensvärde (NNR 2023)', () => {
  it('35 g för män, 25 g för kvinnor, 30 g utan kön', () => {
    expect(fiberReferenceG('man')).toBe(35);
    expect(fiberReferenceG('kvinna')).toBe(25);
    expect(fiberReferenceG(undefined)).toBe(30);
  });

  it('utan upptrappning gäller referensvärdet direkt', () => {
    const glp1 = { glp1Enabled: true, today: TODAY };
    expect(fiberGoal({ sex: 'man', fiberRamp: false }, glp1)).toEqual({
      goalG: 35,
      referenceG: 35,
      ramping: false,
    });
    expect(fiberGoal({ sex: 'kvinna', fiberRamp: false }, glp1)?.goalG).toBe(25);
    expect(fiberGoalText({ goalG: 35, referenceG: 35, ramping: false })).toBe(
      'Fibermål: 35 g per dag',
    );
  });
});

describe('när fibermålet visas', () => {
  it('automatiskt med GLP-1, annars bara med "Visa fibermål"', () => {
    expect(fiberGoalVisible({ sex: 'man' }, true)).toBe(true);
    expect(fiberGoalVisible({ sex: 'man' }, false)).toBe(false);
    expect(fiberGoalVisible({ sex: 'man', showFiberGoal: true }, false)).toBe(true);
    expect(fiberGoalVisible(null, true)).toBe(false);
    expect(fiberGoal({ sex: 'man' }, { glp1Enabled: false, today: TODAY })).toBeNull();
  });
});

describe('upptrappning', () => {
  const days = (values: [string, number][]) => values.map(([date, fiberG]) => ({ date, fiberG }));

  it('startvärdet är snittet av de senaste 7 loggade dagarna före idag', () => {
    const history = days([
      ['2026-09-10', 40], // äldre än de 7 senaste loggade dagarna
      ['2026-09-18', 12],
      ['2026-09-20', 14],
      ['2026-09-21', 10],
      ['2026-09-23', 16],
      ['2026-09-24', 12],
      ['2026-09-26', 18],
      ['2026-09-28', 16],
      ['2026-09-29', 30], // idag räknas inte – dagen är inte slut
    ]);
    // (12 + 14 + 10 + 16 + 12 + 18 + 16) / 7 = 14
    expect(rampStartG(history, TODAY, 35)).toBe(14);
  });

  it('utan data börjar upptrappningen på 15 g', () => {
    expect(rampStartG([], TODAY, 35)).toBe(FIBER_RAMP_DEFAULT_START_G);
    // Dagar utan känd fiber (t.ex. bara snabbloggar) räknas inte som loggade.
    expect(rampStartG(days([['2026-09-28', 0]]), TODAY, 35)).toBe(15);
  });

  it('startvärdet blir aldrig högre än referensvärdet', () => {
    expect(rampStartG(days([['2026-09-28', 40]]), TODAY, 25)).toBe(25);
  });

  it('höjs med 3 g per hel vecka och stannar vid referensvärdet', () => {
    const start = { date: '2026-09-01', startG: 14 };
    expect(weeklyFiberGoalG(start, 35, '2026-09-01')).toBe(14);
    expect(weeklyFiberGoalG(start, 35, '2026-09-07')).toBe(14);
    expect(weeklyFiberGoalG(start, 35, '2026-09-08')).toBe(17);
    expect(weeklyFiberGoalG(start, 35, '2026-09-15')).toBe(20);
    // Sju veckor: 14 + 21 = 35 – taket.
    expect(weeklyFiberGoalG(start, 35, '2026-10-20')).toBe(35);
    expect(weeklyFiberGoalG(start, 35, '2027-03-01')).toBe(35);
    // Dagar före starten ger startvärdet.
    expect(weeklyFiberGoalG(start, 35, '2026-08-20')).toBe(14);
  });

  it('veckans mål visas med referensvärdet tills taket nås', () => {
    const profile = { sex: 'man' as const, fiberRampStart: { date: '2026-09-15', startG: 15 } };
    const goal = fiberGoal(profile, { glp1Enabled: true, today: TODAY });
    expect(goal).toEqual({ goalG: 21, referenceG: 35, ramping: true });
    expect(goal && fiberGoalText(goal)).toBe('Veckans fibermål: 21 g (mål 35 g)');
    const done = fiberGoal(
      { sex: 'kvinna' as const, fiberRampStart: { date: '2026-06-01', startG: 15 } },
      { glp1Enabled: true, today: TODAY },
    );
    expect(done).toEqual({ goalG: 25, referenceG: 25, ramping: false });
  });

  it('utan sparad start används den väntande starten (eller 15 g från idag)', () => {
    const input = { glp1Enabled: true, today: TODAY };
    expect(fiberGoal({ sex: 'man' }, input)?.goalG).toBe(15);
    expect(
      fiberGoal({ sex: 'man' }, { ...input, pendingStart: { date: TODAY, startG: 19 } })?.goalG,
    ).toBe(19);
  });

  it('avstängd trappa ignorerar en sparad start', () => {
    const profile = {
      sex: 'man' as const,
      fiberRamp: false,
      fiberRampStart: { date: TODAY, startG: 15 },
    };
    expect(fiberGoal(profile, { glp1Enabled: true, today: TODAY })?.goalG).toBe(35);
  });
});

describe('fiber ur matloggen', () => {
  it('summerar känd fiber och räknar poster utan fiberdata', () => {
    const log = [
      entry('Gröt', TODAY, 'lv:1', 100), // 10 g
      entry('Bröd', TODAY, 'lv:2', 50), // 1 g
      entry('Müsli', TODAY, 'off:123', 50), // 3 g (Open Food Facts med fiber)
      entry('Okänd', TODAY, 'off:999', 100), // OFF utan fibervärde
      entry('Frukt', TODAY, 'lv:3', 100), // Livsmedelsverket men utan fiber
      entry('Pizza', TODAY, 'snabb:pizza:700:30', 100, { estimated: true }),
    ];
    const total = fiberOfEntries(log, source);
    expect(total.fiberG).toBeCloseTo(14);
    expect(total.missingEntries).toBe(3);
    expect(total.entries).toBe(6);
  });

  it('per dag, äldst först', () => {
    const log = [
      entry('A', '2026-09-28', 'lv:1', 200),
      entry('B', '2026-09-27', 'lv:2', 100),
      entry('C', '2026-09-28', 'lv:2', 100),
    ];
    expect(dailyFiber(log, source)).toEqual([
      { date: '2026-09-27', fiberG: 2, missingEntries: 0, entries: 1 },
      { date: '2026-09-28', fiberG: 22, missingEntries: 0, entries: 2 },
    ]);
  });
});

describe('fiberrika livsmedel', () => {
  const food = (kcal: number, fiberG?: number) => ({
    per100: { kcal },
    ...(fiberG === undefined ? {} : { extra: { fiberG } }),
  });

  it('minst 3 g fiber per 100 kcal', () => {
    expect(isFiberRich(food(100, 3))).toBe(true); // precis på gränsen
    expect(isFiberRich(food(34, 2.6))).toBe(true); // broccoli
    expect(isFiberRich(food(370, 10))).toBe(false); // havregryn: 2,7 g/100 kcal
    expect(isFiberRich(food(100, 2.9))).toBe(false);
  });

  it('utan energi eller fiberdata räknas inget som fiberrikt', () => {
    expect(isFiberRich(food(0, 3))).toBe(false);
    expect(isFiberRich(food(100))).toBe(false);
    expect(isFiberRich(food(100, 0))).toBe(false);
  });
});
