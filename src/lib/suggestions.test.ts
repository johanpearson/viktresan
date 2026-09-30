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
  mainComponentEntries,
  median,
  atLeastMinPortion,
  claimsOfParts,
  diversify,
  gapScoreParts,
  gapWeights,
  gapsOf,
  nutritionScore,
  portionCap,
  portionPenalty,
  overBudgetPenalty,
  scaleProteinPortion,
  standardAmount,
  statusText,
  suggestionEntries,
  typicalAmount,
  typicalSlotKcal,
  type Goals,
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

  it('en kombination visas med båda delarnas namn och etiketter ur totalen', () => {
    const log = [
      ...[1, 2].flatMap((d) => [
        entry(KVARG, day(d), 'mellanmal', 165),
        entry(BLABAR, day(d), 'mellanmal', 60),
      ]),
      entry(AGG, day(3), 'mellanmal', 60, 'st', 1),
      entry(GURKA, day(4), 'mellanmal', 100),
    ];
    const result = buildSuggestions(input({ log }));
    const combo = result.suggestions.find((s) => s.parts.length === 2);
    expect(combo?.name).toBe('Kvarg naturell + Blåbär');
    // Blåbären är Fiberrik, men 1,9 g fiber på 138 kcal räcker inte för kombinationen.
    expect(combo?.claims).toEqual(['proteinrik']);
  });
});

describe('gap och näringspoäng', () => {
  const gaps = (eaten: { kcal: number; proteinG: number; fiberG: number }) => gapsOf(eaten, GOALS);
  const kvarg = { kcal: 106, proteinG: 16.5, fiberG: 0 };
  const bar = { kcal: 64, proteinG: 0.8, fiberG: 3.7 };

  it('gapet är max(0, mål − intag) och andelen av målet som återstår', () => {
    const g = gaps({ kcal: 1000, proteinG: 79, fiberG: 36 });
    expect(g.protein.grams).toBe(41);
    expect(g.protein.share).toBeCloseTo(41 / 120);
    expect(g.fiber).toEqual({ grams: 0, share: 0 });
    expect(
      gapsOf({ kcal: 0, proteinG: 0, fiberG: 0 }, { ...GOALS, proteinGoalG: null }).protein,
    ).toEqual({ grams: 0, share: 0 });
  });

  it('vikterna är proportionella mot andelen av respektive mål som återstår', () => {
    // 60 g protein kvar = 50 %, 7,5 g fiber kvar = 25 % → 2/3 och 1/3.
    const w = gapWeights(gaps({ kcal: 1000, proteinG: 60, fiberG: 22.5 }));
    expect(w.protein).toBeCloseTo(2 / 3);
    expect(w.fiber).toBeCloseTo(1 / 3);
  });

  it('näringspoängen = wP × fyllt proteingap + wF × fyllt fibergap', () => {
    const g = gaps({ kcal: 1000, proteinG: 60, fiberG: 22.5 });
    expect(nutritionScore(kvarg, g)).toBeCloseTo((2 / 3) * (16.5 / 60));
    expect(nutritionScore(bar, g)).toBeCloseTo((2 / 3) * (0.8 / 60) + (1 / 3) * (3.7 / 7.5));
    // Mer än gapet räknas inte.
    expect(nutritionScore({ kcal: 500, proteinG: 200, fiberG: 50 }, g)).toBeCloseTo(1);
  });

  it('lågt protein ger proteinrikt förslag, lågt fiber fiberrikt', () => {
    const lowProtein = gaps({ kcal: 1000, proteinG: 30, fiberG: 25 });
    expect(nutritionScore(kvarg, lowProtein)).toBeGreaterThan(nutritionScore(bar, lowProtein));
    const lowFiber = gaps({ kcal: 1000, proteinG: 118, fiberG: 5 });
    expect(nutritionScore(bar, lowFiber)).toBeGreaterThan(nutritionScore(kvarg, lowFiber));
  });

  it('näringen står för minst 70 % och vanan för högst 20 % av totalpoängen', () => {
    for (const n of [0, 0.01, 0.05, 0.2, 0.5, 1]) {
      for (const h of [0, 0.5, 1]) {
        for (const l of [0, 0.5, 1]) {
          const p = gapScoreParts(n, h, l);
          const total = p.nutrition + p.habit + p.light;
          if (total === 0) continue;
          expect(p.nutrition / total).toBeGreaterThanOrEqual(0.7 - 1e-9);
          expect(p.habit / total).toBeLessThanOrEqual(0.2 + 1e-9);
        }
      }
    }
  });

  it('straffar förslag över måltidens typiska kcal och över det som är kvar', () => {
    expect(portionPenalty(250, 250)).toBe(0);
    expect(portionPenalty(600, 250)).toBeGreaterThan(0.5);
    expect(overBudgetPenalty(300, 200)).toBeGreaterThan(1);
    expect(overBudgetPenalty(100, 200)).toBe(0);
  });

  it('visar aldrig förslag över kcal-målet', () => {
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
    // För små portioner straffas inte – de höjs till kategorins minsta.
    expect(portionPenalty(20, 250)).toBe(0);
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
      '28 g fiber och 110 g protein kvar · 900 kcal kvar',
    );
    expect(statusText(eaten, GOALS, remaining, 21)).toBe('900 kcal kvar idag');
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

  it('blandad historik: egen data finns bland de tre första', () => {
    const log = [
      entry(KVARG, day(1), 'mellanmal', 165),
      entry(KVARG, day(4), 'mellanmal', 165),
      entry(BLABAR, day(2), 'mellanmal', 100),
    ];
    const result = buildSuggestions(input({ log, start: START_SUGGESTIONS }));
    const top = result.suggestions.slice(0, 3);
    expect(top.some((s) => !s.general)).toBe(true);
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

describe('näringsgap styr förslagen (obligatoriska scenarion)', () => {
  const KANELBULLE = food('lv:30', 'Kanelbulle', per100(380, 7, 50, 16), 2);
  const KESO = food('lv:31', 'Keso', per100(80, 12.5, 2.5, 2), 0);
  const SKYR = food('lv:32', 'Skyr naturell', per100(58, 11, 3.5, 0.2), 0);
  const APPLE = food('lv:33', 'Äpple', per100(52, 0.3, 11, 0.2), 2.4);
  const PARON = food('lv:34', 'Päron', per100(54, 0.3, 11.5, 0.1), 3.1);
  const HALLON = food('lv:35', 'Hallon', per100(48, 1.2, 7.6, 0.4), 4.5);
  const KNACKEBROD = food('lv:36', 'Knäckebröd fullkorn råg', per100(356, 10, 65, 2.6), 14.2);
  const KYCKLING = food('lv:37', 'Kyckling bröstfilé stekt', per100(116, 23, 0, 2.5), 0);
  const SALLAD = food('lv:38', 'Grönsallad', per100(15, 1.2, 1.5, 0.2), 1.3);
  const TOMAT = food('lv:39', 'Tomat', per100(20, 0.8, 3, 0.2), 1.2);
  const DRESSING = food('lv:40', 'Dressing', per100(300, 1, 5, 30), 0);
  const BROD = food('lv:41', 'Bröd vitt', per100(260, 8, 48, 3), 2.5);
  const OST = food('lv:42', 'Ost hårdost', per100(350, 27, 0, 27), 0);
  const CAPPUCCINO: FoodItem = {
    ...food('lv:44', 'Cappuccino', per100(45, 3.3, 4.6, 1.5), 0),
    per100Unit: 'ml',
  };
  const FOODS = [
    KVARG,
    BLABAR,
    AGG,
    GURKA,
    KANELBULLE,
    KESO,
    SKYR,
    APPLE,
    PARON,
    HALLON,
    KNACKEBROD,
    KYCKLING,
    SALLAD,
    TOMAT,
    DRESSING,
    BROD,
    OST,
    CAPPUCCINO,
  ];
  const catalog = new Map(FOODS.map((f) => [f.id, f]));
  const fiber: FiberSource = { meals: [], lookup: (id) => catalog.get(id)?.extra };

  /** Dagens intag som en enda post med exakta värden (100 g, per 100 g = värdena). */
  function today(kcal: number, proteinG: number, fiberG: number): FoodLogEntry {
    const f = food('lv:99', 'Dagens mat', per100(kcal, proteinG), fiberG);
    catalog.set(f.id, f);
    return entry(f, TODAY, 'lunch', 100);
  }

  /** Fem veckors vana: kanelbulle nästan varje dag till mellanmål, lite av allt annat. */
  const habits = [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => entry(KANELBULLE, day(d), 'mellanmal', 80)),
    ...[2, 5, 9].map((d) => entry(KVARG, day(d), 'mellanmal', 150)),
    ...[3, 7].map((d) => entry(AGG, day(d), 'mellanmal', 120, 'st', 2)),
    entry(KESO, day(4), 'mellanmal', 100),
    entry(SKYR, day(6), 'mellanmal', 150),
    ...[1, 4, 8].map((d) => entry(APPLE, day(d), 'mellanmal', 150, 'st', 1)),
    entry(PARON, day(6), 'mellanmal', 150, 'st', 1),
    entry(HALLON, day(3), 'mellanmal', 60),
    entry(KNACKEBROD, day(5), 'mellanmal', 24),
    entry(GURKA, day(2), 'mellanmal', 100),
  ];

  function suggest(log: FoodLogEntry[], overrides: Partial<SuggestInput> = {}) {
    return buildSuggestions(input({ log, catalog, fiberSource: fiber, ...overrides }));
  }

  it('302 kcal och 41 g protein kvar, mellanmål: topp 3 är proteinrika, kanelbulle är inte med', () => {
    // 1 800 − 1 498 = 302 kcal, 120 − 79 = 41 g protein, fiber 29 av 30 (inom 10 %).
    const result = suggest([...habits, today(1498, 79, 29)]);
    expect(result.remaining.kcal).toBe(302);
    expect(result.status).toBe('41 g protein kvar · 302 kcal kvar');
    const top = result.suggestions.slice(0, 3);
    expect(top).toHaveLength(3);
    for (const s of top) expect(s.claims, s.name).toContain('proteinrik');
    expect(top.map((s) => s.name).join(' | ')).not.toMatch(/Kanelbulle/);
    for (const s of top) expect(s.reason).toMatch(/protein/i);
  });

  it('rubriken: båda gapen, störst först; "Du ligger bra till" bara inom 10 %', () => {
    const both = suggest([...habits, today(1498, 79, 24)]);
    expect(both.status).toBe('41 g protein och 6 g fiber kvar · 302 kcal kvar');
    const fine = suggest([...habits, today(1300, 110, 28)]);
    expect(fine.status).toBe('Du ligger bra till idag · 500 kcal kvar');
    // 12 g protein kvar = 10 % → fortfarande inom.
    expect(suggest([...habits, today(1300, 108, 28)]).status).toMatch(/^Du ligger bra till/);
    expect(suggest([...habits, today(1300, 107, 28)]).status).toBe(
      '13 g protein kvar · 500 kcal kvar',
    );
  });

  it('300 kcal och 12 g fiber kvar, protein uppnått: fiberrika förslag först', () => {
    const result = suggest([...habits, today(1500, 125, 18)]);
    expect(result.remaining.kcal).toBe(300);
    expect(result.status).toBe('12 g fiber kvar · 300 kcal kvar');
    const top = result.suggestions.slice(0, 3);
    expect(top).toHaveLength(3);
    for (const s of top) expect(s.claims, s.name).toContain('fiberrik');
    expect(top[0]?.reason).toMatch(/fiber/i);
    expect(result.suggestions[0]?.claims).not.toContain('proteinrik');
  });

  it('alla gap små: energisnåla och vanliga förslag', () => {
    const result = suggest([...habits, today(1300, 115, 29)]);
    expect(result.scoreMode).toBe('small');
    expect(result.status).toMatch(/^Du ligger bra till idag/);
    const top = result.suggestions.slice(0, 3);
    expect(top).toHaveLength(3);
    // Rangordnat på lätthet + vana: energisnålt eller något man brukar äta till mellanmål.
    for (const s of top) {
      const usual = s.inSlot >= 2;
      expect(s.claims.includes('energisnal') || usual, s.name).toBe(true);
    }
    expect(top.some((s) => s.claims.includes('energisnal'))).toBe(true);
    // Ingen näringspoäng används.
    expect(top.every((s) => s.scoreParts.nutrition === 0)).toBe(true);
  });

  it('kycklingportionen skalas aldrig under 75 g', () => {
    const part = { food: KYCKLING, amount: 15, unit: 'g', grams: 15 };
    // Litet proteingap och lite kcal: fyller gapet med 15 g – men minst 75 g.
    expect(scaleProteinPortion(part, 3, 40).grams).toBeGreaterThanOrEqual(75);
    expect(atLeastMinPortion(part).grams).toBe(75);
    expect(fitPortion([{ ...part, amount: 100, grams: 100 }], 500, 50)[0]?.grams).toBe(75);
    // Ägg minst 1 st, kvarg minst 1 dl.
    expect(atLeastMinPortion({ food: AGG, amount: 0.5, unit: 'st', grams: 30 }).amount).toBe(1);
    expect(atLeastMinPortion({ food: KVARG, amount: 0.5, unit: 'dl', grams: 55 }).amount).toBe(1);
  });

  it('kyckling som liten del av en sallad blir inte typisk mängd – förslaget har minst 75 g', () => {
    const salads = [1, 2, 3, 4, 5].flatMap((d) => [
      entry(KYCKLING, day(d), 'lunch', 15),
      entry(SALLAD, day(d), 'lunch', 80),
      entry(TOMAT, day(d), 'lunch', 100),
      entry(DRESSING, day(d), 'lunch', 30),
      entry(BROD, day(d), 'lunch', 70),
      entry(OST, day(d), 'lunch', 20),
    ]);
    const kyckling = salads.filter((e) => e.foodId === KYCKLING.id);
    expect(mainComponentEntries(kyckling, salads)).toEqual([]);
    const result = suggest([...salads, today(900, 40, 12)], { slot: 'lunch' });
    const s = result.suggestions.find((x) => x.key === KYCKLING.id);
    expect(s?.parts[0]?.grams).toBeGreaterThanOrEqual(75);
    expect(s?.reason).toBe('Mycket protein per kcal');
  });

  it('proteinkällan skalas inom 0,5–2 × portionen för att fylla gapet så långt kcal räcker', () => {
    const part = { food: KVARG, amount: 100, unit: 'g', grams: 100 };
    // 41 g protein kvar → 410 g, men högst 2 × 100 g.
    expect(scaleProteinPortion(part, 41, 1000).grams).toBe(200);
    // 150 kcal räcker till 234 g → 200 g; 100 kcal → 155 g.
    expect(scaleProteinPortion(part, 41, 100).grams).toBe(155);
    // Litet gap → hälften, men aldrig under 1 dl kvarg.
    expect(scaleProteinPortion(part, 2, 1000).grams).toBe(100);
  });

  it('cappuccino + äpple får ingen Proteinrik-etikett när totalen inte uppfyller regeln', () => {
    const cappuccino = { food: CAPPUCCINO, amount: 2, unit: 'dl', grams: 200 };
    const apple = { food: APPLE, amount: 1, unit: 'st', grams: 150 };
    // Cappuccinon ensam är Proteinrik (29 % av energin från protein) …
    expect(claimsOfParts([cappuccino], fiber)).toContain('proteinrik');
    // … men tillsammans med äpplet bara 16 %.
    expect(claimsOfParts([cappuccino, apple], fiber)).not.toContain('proteinrik');

    const log = [1, 2, 3].flatMap((d) => [
      { ...entry(CAPPUCCINO, day(d), 'mellanmal', 200, 'dl', 2), per100Unit: 'ml' as const },
      entry(APPLE, day(d), 'mellanmal', 150, 'st', 1),
    ]);
    const result = suggest([...log, today(1200, 70, 20)]);
    const combo = result.suggestions.find((s) => s.key === `${APPLE.id}+${CAPPUCCINO.id}`);
    expect(combo).toBeDefined();
    expect(combo?.claims).not.toContain('proteinrik');
  });

  it('kombinationer kompletterar: en protein- eller fiberkälla + något man brukar äta till', () => {
    // Kaffe + bulle loggas ihop ofta, men ingen av dem är en protein- eller fiberkälla.
    const KAFFE = food('lv:43', 'Kaffe med mjölk', per100(20, 0.5, 1.5, 1), 0);
    catalog.set(KAFFE.id, KAFFE);
    const log = [1, 2, 3].flatMap((d) => [
      entry(KANELBULLE, day(d), 'mellanmal', 80),
      entry(KAFFE, day(d), 'mellanmal', 200),
      entry(KVARG, day(d + 3), 'mellanmal', 150),
      entry(BLABAR, day(d + 3), 'mellanmal', 60),
    ]);
    const single = candidatesFor(input({ log, catalog }));
    const keys = combinations(single, log, 'mellanmal', TODAY, fiber).map((c) => c.key);
    expect(keys).toContain(`${KVARG.id}+${BLABAR.id}`);
    expect(keys).not.toContain(`${KANELBULLE.id}+${KAFFE.id}`);
  });

  it('inget livsmedel förekommer i mer än ett av tre förslag', () => {
    const log = [
      ...habits,
      ...[1, 2, 3].flatMap((d) => [
        entry(KVARG, day(d), 'mellanmal', 150),
        entry(BLABAR, day(d), 'mellanmal', 60),
        entry(HALLON, day(d + 3), 'mellanmal', 60),
        entry(KVARG, day(d + 3), 'mellanmal', 150),
      ]),
    ];
    for (const eaten of [today(1000, 40, 10), today(1400, 80, 25), today(1500, 125, 18)]) {
      const result = suggest([...log, eaten]);
      for (let page = 0; page < result.suggestions.length; page += 3) {
        const ids = result.suggestions
          .slice(page, page + 3)
          .flatMap((s) => s.parts.map((p) => p.food.id));
        expect(new Set(ids).size, ids.join(', ')).toBe(ids.length);
      }
    }
  });

  it('varje förslag har en kort förklaring', () => {
    for (const eaten of [today(1000, 40, 10), today(1300, 115, 29)]) {
      const result = suggest([...habits, eaten]);
      for (const s of result.suggestions) expect(s.reason, s.name).not.toBe('');
    }
    // Från klockan 20 nämns inte protein eller fiber.
    const late = suggest([...habits, today(1000, 40, 10)], { hour: 21 });
    for (const s of late.suggestions) expect(s.reason).not.toMatch(/protein|fiber/i);
  });

  it('diversify flyttar krockar till nästa sida', () => {
    const p = (id: string) => ({ parts: [{ food: { id } }] });
    const pair = (a: string, b: string) => ({ parts: [{ food: { id: a } }, { food: { id: b } }] });
    const out = diversify([p('a'), pair('a', 'b'), p('b'), p('c'), p('d'), p('e')]);
    expect(out.map((x) => x.parts.map((q) => q.food.id).join('+'))).toEqual([
      'a',
      'b',
      'c',
      'a+b',
      'd',
      'e',
    ]);
  });
});
