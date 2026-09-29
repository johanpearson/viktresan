import { describe, expect, it } from 'vitest';
import type { ExtraNutrients } from '../data/nutrients.ts';
import type { FoodLogEntry } from '../db/db.ts';
import {
  FIBER_RAMP_DEFAULT_START_G,
  dailyFiber,
  fiberGoal,
  fiberGoalText,
  fiberGoalVisible,
  fiberAmountOf,
  fiberForItem,
  fiberOfEntries,
  fiberReferenceG,
  fiberSum,
  fiberText,
  formatMacroG,
  scaleFiber,
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
      { date: '2026-09-27', fiberG: 2, missingEntries: 0, knownEntries: 1, entries: 1 },
      { date: '2026-09-28', fiberG: 22, missingEntries: 0, knownEntries: 2, entries: 2 },
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

describe('fiber i matloggningen (per enhet och summa)', () => {
  const lv = {
    id: 'lv:1',
    source: 'livsmedelsverket' as const,
    per100: { kcal: 250, proteinG: 8, carbsG: 45, fatG: 3 },
    extra: { fiberG: 6 },
  };

  it('räknar fiber för vald mängd: 2 skivor à 35 g = 70 g → 4,2 g', () => {
    const skiva = 35;
    expect(fiberForItem(lv, 2 * skiva, source)).toEqual({ fiberG: 4.2, partial: false });
    expect(fiberForItem(lv, 100, source)).toEqual({ fiberG: 6, partial: false });
    // Volymenhet: 1 dl ≈ 35 g havregryn (10 g/100 g) → 3,5 g.
    expect(fiberForItem({ ...lv, id: 'lv:x', extra: { fiberG: 10 } }, 35, source)?.fiberG).toBe(
      3.5,
    );
  });

  it('slår upp fiber på id:t när livsmedlet saknar eget värde (redigering av en post)', () => {
    const logged = { id: 'off:123', source: 'openfoodfacts' as const, per100: lv.per100 };
    expect(fiberForItem(logged, 50, source)).toEqual({ fiberG: 3, partial: false });
  });

  it('saknas fiberdata blir det null ("–"), inte 0', () => {
    const unknown = { id: 'off:999', source: 'openfoodfacts' as const, per100: lv.per100 };
    expect(fiberForItem(unknown, 100, source)).toBeNull();
    const quick = { id: 'snabb:pizza:700:30', source: 'snabb' as const, per100: lv.per100 };
    expect(fiberForItem(quick, 100, source)).toBeNull();
    expect(fiberText(null)).toEqual({ text: '–', partial: false });
  });

  it('en sparad måltid räknas ur ingredienserna, och en ingrediens utan fiber markeras', () => {
    const meal = {
      id: 'm1',
      name: 'Frukost',
      createdAt: 1,
      items: [
        { foodId: 'lv:1', name: 'Gröt', amount: 100, unit: 'g', grams: 100, per100: lv.per100 },
        { foodId: 'off:999', name: 'Sylt', amount: 100, unit: 'g', grams: 100, per100: lv.per100 },
      ],
    };
    const withMeals = { meals: [meal], lookup: source.lookup };
    const item = { id: 'maltid:m1', source: 'maltid' as const, per100: lv.per100 };
    // Halva måltiden (100 g av 200 g): 50 g gröt → 5 g, sylten saknar fiber.
    expect(fiberForItem(item, 100, withMeals)).toEqual({ fiberG: 5, partial: true });
  });

  it('ett recept räknas ur receptets ingredienser', () => {
    const item = {
      id: 'recept:r1',
      source: 'recept' as const,
      per100: lv.per100,
      recipe: {
        yieldG: 400,
        items: [
          { foodId: 'lv:2', name: 'Bönor', amount: 200, unit: 'g', grams: 200, per100: lv.per100 },
        ],
      },
    };
    // En portion om 100 g av 400 g: 50 g bönor à 2 g/100 g → 1 g.
    expect(fiberForItem(item, 100, source)).toEqual({ fiberG: 1, partial: false });
  });

  it('summan räknar inte in poster utan fiber men markerar att den kan vara i underkant', () => {
    const log = [
      entry('Gröt', TODAY, 'lv:1', 100), // 10 g
      entry('Okänd', TODAY, 'off:999', 100),
      entry('Pizza', TODAY, 'snabb:pizza:700:30', 100, { estimated: true }),
    ];
    const total = fiberOfEntries(log, source);
    expect(total).toMatchObject({ fiberG: 10, missingEntries: 2, knownEntries: 1, entries: 3 });
    expect(fiberAmountOf(total)).toEqual({ fiberG: 10, partial: true });
    expect(fiberText(fiberAmountOf(total), true)).toEqual({ text: '10 g', partial: true });
  });

  it('en summa där alla poster har fiber saknar markering', () => {
    const log = [entry('Gröt', TODAY, 'lv:1', 100), entry('Bröd', TODAY, 'lv:2', 50)];
    expect(fiberSum(log, source)).toEqual({ fiberG: 11, partial: false });
  });

  it('en summa utan någon post med fiberdata är null ("–")', () => {
    const log = [
      entry('Okänd', TODAY, 'off:999', 100),
      entry('Pizza', TODAY, 'snabb:pizza:700:30', 100, { estimated: true }),
    ];
    expect(fiberSum(log, source)).toBeNull();
    expect(fiberSum([], source)).toBeNull();
  });

  it('skalar till per 100 g och per portion, och null/undefined förblir', () => {
    expect(scaleFiber({ fiberG: 12, partial: true }, 1 / 4)).toEqual({ fiberG: 3, partial: true });
    expect(scaleFiber(null, 2)).toBeNull();
    expect(scaleFiber(undefined, 2)).toBeUndefined();
  });

  it('formaterar alltid med en decimal under 10 g, annars hela gram', () => {
    expect(formatMacroG(0)).toBe('0,0 g');
    expect(formatMacroG(0.44)).toBe('0,4 g');
    expect(formatMacroG(4.2)).toBe('4,2 g');
    expect(formatMacroG(6)).toBe('6,0 g');
    expect(formatMacroG(9.94)).toBe('9,9 g');
    expect(formatMacroG(9.96)).toBe('10 g');
    expect(formatMacroG(10)).toBe('10 g');
    expect(formatMacroG(30.4)).toBe('30 g');
    expect(formatMacroG(1234.4)).toBe('1 234 g');
    expect(fiberText({ fiberG: 4.25, partial: false })).toEqual({ text: '4,3 g', partial: false });
  });
});
