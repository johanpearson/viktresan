import { describe, expect, it } from 'vitest';
import fineliRaw from '../../public/fineli.json?raw';
import livsmedelRaw from '../../public/livsmedel.json?raw';
import { START_SUGGESTIONS } from '../data/suggestions.ts';
import type { FoodLogEntry } from '../db/db.ts';
import { claimsFor } from './claims.ts';
import { addDays } from './dates.ts';
import type { FiberSource } from './fiber.ts';
import type { FoodItem } from './foodSearch.ts';
import { parseLivsmedel } from './livsmedel.ts';
import type { MealSlot, Nutrients } from './nutrition.ts';
import {
  LOW_TEXT,
  MIN_OWN_CANDIDATES,
  buildSuggestions,
  candidatesFor,
  combinations,
  commonFoods,
  dislikeFactor,
  effectText,
  fitPortion,
  historyStats,
  historyWeight,
  median,
  nutritionScore,
  portionCap,
  portionPenalty,
  overBudgetPenalty,
  standardAmount,
  statusText,
  suggestionEntries,
  typicalAmount,
  typicalSlotKcal,
  type Goals,
  type ScoreContext,
  type SuggestInput,
} from './suggestions.ts';

const TODAY = '2026-09-24';

function per100(kcal: number, proteinG: number, carbsG = 0, fatG = 0): Nutrients {
  return { kcal, proteinG, carbsG, fatG };
}

function food(id: string, name: string, n: Nutrients, fiberG?: number): FoodItem {
  const item: FoodItem = { id, name, source: 'livsmedelsverket', per100: n };
  if (fiberG !== undefined) item.extra = { fiberG };
  return item;
}

const KVARG = food('lv:1', 'Kvarg naturell', per100(64, 10, 5.2, 0.2), 0);
const BLABAR = food('lv:2', 'Blåbär', per100(53, 0.7, 9.1, 0.8), 3.1);
const BULLE = food('lv:3', 'Kanelbulle', per100(380, 7, 50, 16), 2);
const AGG = food('lv:4', 'Ägg kokt', per100(136, 12.1, 0, 9.8), 0);
const GURKA = food('lv:5', 'Gurka', per100(13, 0.8, 2.3, 0.1), 0.7);
const KNACKE = food('lv:6', 'Knäckebröd fullkorn råg', per100(356, 10, 65, 2.6), 14.2);
const LASAGNE = food('lv:7', 'Lasagne', per100(160, 8, 14, 8), 1);

const CATALOG = new Map([KVARG, BLABAR, BULLE, AGG, GURKA, KNACKE, LASAGNE].map((f) => [f.id, f]));
const FIBER: FiberSource = { meals: [], lookup: (id) => CATALOG.get(id)?.extra };

let seq = 0;
function entry(
  f: FoodItem,
  date: string,
  meal: MealSlot,
  grams: number,
  unit = 'g',
  amount = grams,
): FoodLogEntry {
  seq += 1;
  return {
    id: `e${String(seq)}`,
    date,
    meal,
    foodId: f.id,
    name: f.name,
    per100: f.per100,
    amount,
    unit,
    grams,
    createdAt: Date.parse(`${date}T12:00:00Z`) + seq,
  };
}

const day = (n: number) => addDays(TODAY, -n);

const GOALS: Goals = { targetKcal: 1800, proteinGoalG: 120, fiberGoalG: 30 };

function input(overrides: Partial<SuggestInput> = {}): SuggestInput {
  return {
    slot: 'mellanmal',
    today: TODAY,
    hour: 15,
    log: [],
    catalog: CATALOG,
    favorites: [],
    dishes: [],
    goals: GOALS,
    fiberSource: FIBER,
    start: [],
    ...overrides,
  };
}

describe('median och typisk mängd', () => {
  it('räknar medianen', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('tar medianen av gram i den enhet som används oftast', () => {
    const logs = [
      entry(KVARG, day(1), 'mellanmal', 110, 'dl', 1),
      entry(KVARG, day(2), 'mellanmal', 165, 'dl', 1.5),
      entry(KVARG, day(3), 'mellanmal', 165, 'dl', 1.5),
      entry(KVARG, day(4), 'mellanmal', 200),
    ];
    expect(typicalAmount(logs)).toEqual({ amount: 1.5, unit: 'dl', grams: 165 });
  });

  it('avrundar gram till 5 g', () => {
    const logs = [
      entry(BLABAR, day(1), 'frukost', 72),
      entry(BLABAR, day(2), 'frukost', 80),
      entry(BLABAR, day(3), 'frukost', 98),
    ];
    expect(typicalAmount(logs)).toEqual({ amount: 80, unit: 'g', grams: 80 });
    expect(typicalAmount([])).toBeNull();
  });

  it('standardportionen: livsmedlets första enhet med vikt, annars 100 g', () => {
    expect(standardAmount(AGG)).toEqual({ amount: 1, unit: 'st', grams: 60 });
    const dish: FoodItem = {
      id: 'recept:r1',
      name: 'Linsgryta',
      source: 'recept',
      per100: per100(120, 6),
      units: [{ name: 'portion', grams: 300, source: 'egen' }],
    };
    expect(standardAmount(dish)).toEqual({ amount: 1, unit: 'portion', grams: 300 });
    expect(standardAmount({ ...dish, units: [] })).toEqual({ amount: 100, unit: 'g', grams: 100 });
  });
});

describe('kandidater', () => {
  it('tar med livsmedel loggade de senaste 28 dagarna, favoriter och egna måltider', () => {
    const dish: FoodItem = {
      id: 'maltid:m1',
      name: 'Kycklinglunch',
      source: 'maltid',
      per100: per100(130, 12),
      units: [{ name: 'portion', grams: 350, source: 'egen' }],
    };
    const result = candidatesFor(
      input({
        log: [
          entry(KVARG, day(2), 'mellanmal', 165),
          // Äldre än 28 dagar: räknas inte.
          entry(BULLE, day(29), 'mellanmal', 80),
        ],
        favorites: [{ foodId: KNACKE.id, createdAt: 1 }],
        dishes: [dish],
      }),
    );
    expect(result.map((c) => c.key).sort()).toEqual([KVARG.id, KNACKE.id, 'maltid:m1'].sort());
    expect(result.find((c) => c.key === KVARG.id)?.parts[0]?.grams).toBe(165);
  });

  it('hoppar över dolda förslag och det som redan loggats i måltiden idag', () => {
    const result = candidatesFor(
      input({
        log: [
          entry(KVARG, day(2), 'mellanmal', 165),
          entry(BLABAR, day(2), 'mellanmal', 60),
          entry(BLABAR, TODAY, 'mellanmal', 60),
        ],
        hidden: [{ key: KVARG.id, name: KVARG.name }],
      }),
    );
    expect(result).toEqual([]);
  });

  it('viktar efter måltid: loggat som mellanmål väger mer för mellanmål än för middag', () => {
    const log = [
      entry(KVARG, day(1), 'mellanmal', 165),
      entry(KVARG, day(3), 'mellanmal', 165),
      entry(KVARG, day(5), 'middag', 165),
    ];
    const stats = historyStats(log, TODAY).get(KVARG.id);
    if (!stats) throw new Error('saknas');
    expect(historyWeight(stats, 'mellanmal', TODAY)).toBeGreaterThan(
      historyWeight(stats, 'middag', TODAY),
    );
  });

  it('viktar efter hur ofta och hur nyligen', () => {
    const often = historyStats(
      [1, 2, 3, 4, 5, 6].map((d) => entry(KVARG, day(d), 'mellanmal', 165)),
      TODAY,
    ).get(KVARG.id);
    const once = historyStats([entry(KVARG, day(1), 'mellanmal', 165)], TODAY).get(KVARG.id);
    const old = historyStats([entry(KVARG, day(20), 'mellanmal', 165)], TODAY).get(KVARG.id);
    if (!often || !once || !old) throw new Error('saknas');
    expect(historyWeight(often, 'mellanmal', TODAY)).toBeGreaterThan(
      historyWeight(once, 'mellanmal', TODAY),
    );
    expect(historyWeight(once, 'mellanmal', TODAY)).toBeGreaterThan(
      historyWeight(old, 'mellanmal', TODAY),
    );
  });

  it('fyller på med startlistan när måltiden har färre än 5 egna kandidater', () => {
    const empty = candidatesFor(input({ start: START_SUGGESTIONS }));
    expect(empty.length).toBeGreaterThan(10);
    expect(empty.every((c) => c.general)).toBe(true);

    const own = [KVARG, BLABAR, AGG, GURKA, KNACKE].map((f) => entry(f, day(1), 'mellanmal', 100));
    const full = candidatesFor(input({ log: own, start: START_SUGGESTIONS }));
    expect(own.length).toBe(MIN_OWN_CANDIDATES);
    expect(full.some((c) => c.general)).toBe(false);
  });

  it('startlistans vikt minskar när den egna historiken växer', () => {
    const startWeight = (log: FoodLogEntry[]) =>
      Math.max(
        ...candidatesFor(input({ log, start: START_SUGGESTIONS }))
          .filter((c) => c.general)
          .map((c) => c.weight),
      );
    const none = startWeight([]);
    const some = startWeight([
      entry(BULLE, day(1), 'mellanmal', 80),
      entry(LASAGNE, day(1), 'mellanmal', 80),
    ]);
    expect(some).toBeLessThan(none);
  });

  it('"Inte intresserad" nedviktar liknande förslag', () => {
    const lattKvarg = food('lv:20', 'Kvarg vanilj', per100(80, 9));
    expect(dislikeFactor(lattKvarg, [{ key: KVARG.id, name: KVARG.name }])).toBeLessThan(1);
    expect(dislikeFactor(BULLE, [{ key: KVARG.id, name: KVARG.name }])).toBe(1);
  });
});

describe('kombinationer', () => {
  it('par som loggats ihop i måltiden minst två gånger', () => {
    const log = [1, 2].flatMap((d) => [
      entry(KVARG, day(d), 'mellanmal', 165),
      entry(BULLE, day(d), 'mellanmal', 40),
    ]);
    const single = candidatesFor(input({ log }));
    const combos = combinations(single, log, 'mellanmal', TODAY, FIBER);
    expect(combos.map((c) => c.key)).toContain(`${KVARG.id}+${BULLE.id}`);
  });

  it('proteinrik + fiberrik kompletterar varandra', () => {
    const log = [entry(KVARG, day(1), 'mellanmal', 165), entry(BLABAR, day(3), 'frukost', 60)];
    const single = candidatesFor(input({ log }));
    const combos = combinations(single, log, 'mellanmal', TODAY, FIBER);
    const combo = combos.find((c) => c.key === `${KVARG.id}+${BLABAR.id}`);
    expect(combo?.parts.map((p) => p.food.name)).toEqual(['Kvarg naturell', 'Blåbär']);
  });

  it('en kombination visas med båda delarnas etiketter och mängder', () => {
    const log = [1, 2].flatMap((d) => [
      entry(KVARG, day(d), 'mellanmal', 165),
      entry(BLABAR, day(d), 'mellanmal', 60),
    ]);
    const result = buildSuggestions(input({ log }));
    const combo = result.suggestions.find((s) => s.parts.length === 2);
    expect(combo?.name).toBe('Kvarg naturell + Blåbär');
    expect(combo?.claims).toEqual(expect.arrayContaining(['proteinrik', 'fiberrik']));
  });
});

describe('poäng', () => {
  const ctx = (eaten: { kcal: number; proteinG: number; fiberG: number }): ScoreContext => ({
    eaten,
    goals: GOALS,
    remaining: {
      kcal: 1800 - eaten.kcal,
      proteinG: 120 - eaten.proteinG,
      fiberG: 30 - eaten.fiberG,
    },
    cap: 250,
    low: false,
  });
  const kvarg = { kcal: 106, proteinG: 16.5, fiberG: 0 };
  const bar = { kcal: 64, proteinG: 0.8, fiberG: 3.7 };

  it('lågt protein ger proteinrikt förslag', () => {
    const c = ctx({ kcal: 1000, proteinG: 30, fiberG: 25 });
    expect(nutritionScore(kvarg, c)).toBeGreaterThan(nutritionScore(bar, c));
  });

  it('lågt fiber ger fiberrikt förslag', () => {
    const c = ctx({ kcal: 1000, proteinG: 110, fiberG: 5 });
    expect(nutritionScore(bar, c)).toBeGreaterThan(nutritionScore(kvarg, c));
  });

  it('lågt protein: det proteinrika förslaget hamnar först', () => {
    const log = [
      entry(KVARG, day(1), 'mellanmal', 165),
      entry(BLABAR, day(1), 'mellanmal', 120),
      entry(KNACKE, day(1), 'frukost', 24),
      // Idag: mycket fiber, lite protein.
      entry(KNACKE, TODAY, 'frukost', 150),
    ];
    const result = buildSuggestions(input({ log }));
    expect(result.status).toMatch(/^Lite lågt på protein idag/);
    expect(result.suggestions[0]?.claims).toContain('proteinrik');
  });

  it('lågt fiber: det fiberrika förslaget hamnar först', () => {
    const log = [
      entry(AGG, day(1), 'mellanmal', 120, 'st', 2),
      entry(BLABAR, day(1), 'mellanmal', 120),
      // Idag: mycket protein, ingen fiber.
      entry(KVARG, TODAY, 'frukost', 1000),
    ];
    const result = buildSuggestions(input({ log }));
    expect(result.status).toMatch(/fiber/);
    expect(result.suggestions[0]?.claims).toContain('fiberrik');
  });

  it('straffar förslag över kcal-målet och visar dem inte', () => {
    expect(overBudgetPenalty(300, 200)).toBeGreaterThan(1);
    expect(overBudgetPenalty(100, 200)).toBe(0);
    const log = [
      entry(LASAGNE, day(1), 'mellanmal', 400),
      entry(KVARG, day(1), 'mellanmal', 165),
      entry(BULLE, TODAY, 'lunch', 390),
    ];
    const result = buildSuggestions(input({ log, goals: { ...GOALS, targetKcal: 1700 } }));
    const left = result.remaining.kcal ?? 0;
    expect(left).toBeGreaterThan(150);
    expect(result.suggestions.every((s) => s.values.kcal <= left)).toBe(true);
  });
});

describe('portionstak', () => {
  it('taket är måltidens typiska kcal, aldrig mer än det som är kvar', () => {
    expect(portionCap(300, { kcal: 1000, proteinG: null, fiberG: null })).toBe(300);
    expect(portionCap(300, { kcal: 200, proteinG: null, fiberG: null })).toBe(200);
    expect(portionCap(300, { kcal: null, proteinG: null, fiberG: null })).toBe(300);
  });

  it('typisk kcal för måltiden = medianen per dag de senaste 28 dagarna', () => {
    const log = [
      entry(KVARG, day(1), 'mellanmal', 200),
      entry(KVARG, day(2), 'mellanmal', 300),
      entry(BLABAR, day(2), 'mellanmal', 100),
      entry(KVARG, day(3), 'mellanmal', 250),
    ];
    // 128, 245 (192 + 53), 160 → median 160.
    expect(typicalSlotKcal(log, 'mellanmal', TODAY, 1800)).toBeCloseTo(160);
    // Utan historik: måltidens andel av dagsmålet.
    expect(typicalSlotKcal([], 'mellanmal', TODAY, 1800)).toBeCloseTo(270);
  });

  it('skalar ner en för stor portion mot taket', () => {
    const part = { food: LASAGNE, amount: 400, unit: 'g', grams: 400 };
    const [fitted] = fitPortion([part], 480, 300);
    expect(fitted?.grams).toBe(250);
    // Aldrig under halva mängden.
    expect(fitPortion([part], 1200, 300)[0]?.grams).toBe(200);
    const unit = { food: AGG, amount: 4, unit: 'st', grams: 240 };
    expect(fitPortion([unit], 326, 150)[0]?.amount).toBe(2);
    // Inom taket: oförändrad.
    expect(fitPortion([part], 330, 300)[0]?.grams).toBe(400);
  });

  it('straffar portioner långt över taket', () => {
    expect(portionPenalty(250, 250)).toBe(0);
    expect(portionPenalty(600, 250)).toBeGreaterThan(1);
    expect(portionPenalty(20, 250)).toBeGreaterThan(0);
  });

  it('förslagen ligger nära måltidens typiska kcal, inte hela budgeten', () => {
    const log = [1, 2, 3].flatMap((d) => [
      entry(LASAGNE, day(d), 'mellanmal', 120),
      entry(KVARG, day(d + 3), 'mellanmal', 165),
    ]);
    const result = buildSuggestions(input({ log }));
    expect(result.remaining.kcal).toBe(1800);
    expect(result.suggestions.every((s) => s.values.kcal <= result.typicalKcal * 1.25)).toBe(true);
  });
});

describe('lågt läge', () => {
  const log = [
    entry(BULLE, day(1), 'mellanmal', 80),
    entry(GURKA, day(1), 'mellanmal', 100),
    entry(KVARG, day(2), 'mellanmal', 165),
  ];

  it('under 150 kcal kvar: bara energisnåla alternativ och en saklig rad', () => {
    const today = entry(LASAGNE, TODAY, 'middag', 1050); // 1 680 kcal → 120 kvar
    const result = buildSuggestions(input({ log: [...log, today], start: START_SUGGESTIONS }));
    expect(result.mode).toBe('low');
    expect(result.status).toBe(LOW_TEXT);
    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const s of result.suggestions) {
      for (const p of s.parts) expect(claimsFor(p.food, FIBER)).toContain('energisnal');
    }
  });

  it('över målet (negativt kvar): samma sak, ingen text om protein eller fiber', () => {
    const today = entry(LASAGNE, TODAY, 'middag', 1300);
    const result = buildSuggestions(input({ log: [...log, today], hour: 21 }));
    expect(result.mode).toBe('low');
    expect(result.status).toBe(LOW_TEXT);
    expect(result.suggestions.map((s) => s.name)).toEqual(['Gurka']);
    expect(
      effectText(
        result.suggestions[0]?.values ?? { kcal: 0, proteinG: 0, fiberG: 0 },
        result.remaining,
        true,
      ),
    ).not.toMatch(/kvar/);
  });

  it('sent på kvällen nämns aldrig protein eller fiber', () => {
    const eaten = { kcal: 900, proteinG: 10, fiberG: 2 };
    const remaining = { kcal: 900, proteinG: 110, fiberG: 28 };
    expect(statusText(eaten, GOALS, remaining, 15)).toBe(
      'Lite lågt på protein och fiber idag · 900 kcal kvar',
    );
    expect(statusText(eaten, GOALS, remaining, 21)).toBe('Du ligger bra till idag · 900 kcal kvar');
  });
});

describe('kallstart', () => {
  it('tom historik ger 3 relevanta startförslag inom kcal-budgeten', () => {
    const result = buildSuggestions(input({ start: START_SUGGESTIONS, catalog: new Map() }));
    const top = result.suggestions.slice(0, 3);
    expect(top).toHaveLength(3);
    const bySlot = new Map(START_SUGGESTIONS.map((s) => [s.id, s.slots]));
    for (const s of top) {
      expect(s.general).toBe(true);
      expect(s.values.kcal).toBeLessThanOrEqual(result.remaining.kcal ?? 0);
      expect(s.values.kcal).toBeLessThanOrEqual(result.cap * 1.25);
      for (const p of s.parts) expect(bySlot.get(p.food.id)).toContain('mellanmal');
    }
    // Relevanta: fyller protein eller fiber.
    expect(top.every((s) => s.claims.some((c) => c === 'proteinrik' || c === 'fiberrik'))).toBe(
      true,
    );
  });

  it('blandad historik prioriterar egen data', () => {
    const log = [
      entry(KVARG, day(1), 'mellanmal', 165),
      entry(KVARG, day(4), 'mellanmal', 165),
      entry(BLABAR, day(2), 'mellanmal', 100),
    ];
    const result = buildSuggestions(input({ log, start: START_SUGGESTIONS }));
    const top = result.suggestions.slice(0, 3);
    expect(top[0]?.general).toBe(false);
    expect(top.filter((s) => !s.general).length).toBeGreaterThanOrEqual(2);
    expect(result.suggestions.some((s) => s.general)).toBe(true);
  });

  it('"Inte intresserad" döljer förslaget', () => {
    const before = buildSuggestions(input({ start: START_SUGGESTIONS, catalog: new Map() }));
    const first = before.suggestions[0];
    if (!first) throw new Error('inga förslag');
    const after = buildSuggestions(
      input({
        start: START_SUGGESTIONS,
        catalog: new Map(),
        hidden: [{ key: first.key, name: first.name }],
      }),
    );
    expect(after.suggestions.map((s) => s.key)).not.toContain(first.key);
  });
});

describe('texter och loggposter', () => {
  it('effekten: protein, fiber och vad som är kvar efteråt', () => {
    expect(
      effectText(
        { kcal: 232, proteinG: 28.2, fiberG: 3.4 },
        { kcal: 500, proteinG: null, fiberG: null },
        false,
      ),
    ).toBe('+28 g protein · +3 g fiber · 268 kcal kvar efteråt');
    expect(
      effectText(
        { kcal: 50, proteinG: 0.4, fiberG: null },
        { kcal: null, proteinG: null, fiberG: null },
        false,
      ),
    ).toBe('');
  });

  it('de vanligaste livsmedlen (brukar finnas hemma)', () => {
    const log = [
      entry(KVARG, day(1), 'mellanmal', 165),
      entry(KVARG, day(2), 'mellanmal', 165),
      entry(BLABAR, day(2), 'mellanmal', 60),
      entry(AGG, day(40), 'frukost', 60),
    ];
    expect(commonFoods(log, TODAY)).toEqual(['Kvarg naturell', 'Blåbär']);
  });

  it('loggposter för en kombination i vald måltid', () => {
    let n = 0;
    const entries = suggestionEntries(
      {
        parts: [
          { food: KVARG, amount: 1.5, unit: 'dl', grams: 165 },
          { food: BLABAR, amount: 1, unit: 'dl', grams: 60 },
        ],
      },
      'mellanmal',
      TODAY,
      () => `id${String(++n)}`,
      1000,
    );
    expect(entries.map((e) => [e.id, e.foodId, e.meal, e.unit, e.grams])).toEqual([
      ['id1', KVARG.id, 'mellanmal', 'dl', 165],
      ['id2', BLABAR.id, 'mellanmal', 'dl', 60],
    ]);
  });
});

describe('startlistan', () => {
  const lv = parseLivsmedel(JSON.parse(livsmedelRaw));
  const fi = parseLivsmedel(JSON.parse(fineliRaw), 'fineli');
  const all = new Map([...lv.foods, ...fi.foods].map((f) => [f.id, f]));

  it('har ungefär 40 förslag, kopplade till Livsmedelsverket eller Fineli', () => {
    expect(START_SUGGESTIONS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(START_SUGGESTIONS.map((s) => s.id)).size).toBe(START_SUGGESTIONS.length);
    for (const s of START_SUGGESTIONS) {
      const known = all.get(s.id);
      expect(known?.name, s.id).toBe(s.name);
      expect(known?.per100, s.id).toEqual(s.per100);
      expect(known?.extra?.fiberG ?? null, s.id).toBe(s.fiberG);
    }
  });

  it('täcker alla måltider med en blandning av proteinrika, fiberrika och energisnåla', () => {
    for (const slot of ['frukost', 'lunch', 'middag', 'mellanmal'] as const) {
      const inSlot = START_SUGGESTIONS.filter((s) => s.slots.includes(slot));
      expect(inSlot.length, slot).toBeGreaterThanOrEqual(10);
    }
    const claims = START_SUGGESTIONS.flatMap((s) => {
      const f = all.get(s.id);
      return f ? claimsFor(f, { meals: [], lookup: () => null }) : [];
    });
    expect(claims.filter((c) => c === 'proteinrik').length).toBeGreaterThanOrEqual(8);
    expect(claims.filter((c) => c === 'fiberrik').length).toBeGreaterThanOrEqual(8);
    expect(claims.filter((c) => c === 'energisnal').length).toBeGreaterThanOrEqual(4);
  });
});
