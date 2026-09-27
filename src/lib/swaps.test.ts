import { describe, expect, it } from 'vitest';
import type { FoodLogEntry } from '../db/db.ts';
import type { FoodItem } from './foodSearch.ts';
import { buildCatalog } from './foodCatalog.ts';
import { suggestSwaps, swapCandidates, swapText } from './swaps.ts';

function food(
  id: number,
  name: string,
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  fiberG?: number,
): FoodItem {
  const item: FoodItem = {
    id: `lv:${String(id)}`,
    name,
    source: 'livsmedelsverket',
    per100: { kcal, proteinG, carbsG, fatG },
  };
  if (fiberG !== undefined) item.extra = { fiberG };
  return item;
}

/** Påhittade testvärden – inte riktiga data. */
const FOODS = [
  food(1, 'Yoghurt naturell fett 3%', 60, 3.5, 4, 3),
  food(2, 'Kvarg naturell fett 0,5%', 60, 11, 3.5, 0.3),
  food(3, 'Yoghurt grekisk fett 10%', 120, 4, 4, 10),
  food(4, 'Bröd vitt formfranska', 250, 8, 48, 3, 2.5),
  food(5, 'Bröd fullkorn råg', 230, 7.5, 40, 3, 8),
  food(6, 'Knäckebröd fullkorn', 340, 10, 60, 2, 18),
  food(7, 'Korv grill', 250, 11, 3, 21),
  food(8, 'Kycklingkorv', 150, 14, 3, 9),
  food(9, 'Vetekli', 200, 15, 20, 5, 40),
  food(10, 'Pasta kokt', 150, 5.5, 30, 1, 1.8),
  food(11, 'Vin rött vol. % 13', 80, 0, 2, 0),
];

function logged(item: FoodItem, grams: number, id = item.id): FoodLogEntry {
  return {
    id,
    date: '2026-09-26',
    meal: 'frukost',
    foodId: item.id,
    name: item.name,
    amount: grams,
    unit: 'g',
    grams,
    per100: item.per100,
    createdAt: 1,
  };
}

const at = (i: number): FoodItem => {
  const f = FOODS[i];
  if (!f) throw new Error('saknas');
  return f;
};

describe('suggestSwaps', () => {
  const candidates = swapCandidates(FOODS);
  const catalog = buildCatalog(FOODS);

  it('föreslår ett proteinrikare livsmedel i samma kategori', () => {
    const [swap] = suggestSwaps([logged(at(0), 200)], candidates, catalog);
    expect(swap?.toName).toBe('Kvarg naturell fett 0,5%');
    expect(swap?.deltaKcal).toBeCloseTo(0);
    expect(swap?.deltaProteinG).toBeCloseTo(15);
    expect(swap?.text).toBe(
      'Byt Yoghurt naturell fett 3% mot Kvarg naturell fett 0,5%: ±0 kcal, +15 g protein',
    );
  });

  it('föreslår fiberrikare när protein per kcal inte blir bättre', () => {
    const [swap] = suggestSwaps([logged(at(3), 100)], candidates, catalog);
    expect(swap?.toName).toBe('Bröd fullkorn råg');
    expect(swap?.deltaKcal).toBeCloseTo(-20);
    expect(swap?.deltaFiberG).toBeCloseTo(5.5);
    expect(swap?.text).toContain('−20 kcal');
    expect(swap?.text).toContain('+6 g fiber');
  });

  it('föreslår aldrig något med mer energi för samma mängd', () => {
    // Knäckebröd har mer fiber men betydligt mer energi per 100 g.
    const swaps = suggestSwaps([logged(at(4), 100)], candidates, catalog);
    expect(swaps.map((s) => s.toName)).not.toContain('Knäckebröd fullkorn');
  });

  it('tar de tre posterna med mest energi, en per post', () => {
    const log = [
      logged(at(0), 200), // 120 kcal
      logged(at(3), 100), // 250 kcal
      logged(at(6), 100), // 250 kcal
      logged(at(9), 50), // 75 kcal
    ];
    const swaps = suggestSwaps(log, candidates, catalog);
    expect(swaps.map((s) => s.fromName)).toEqual([
      'Bröd vitt formfranska',
      'Korv grill',
      'Yoghurt naturell fett 3%',
    ]);
    expect(swaps[1]?.toName).toBe('Kycklingkorv');
    expect(swaps[1]?.deltaKcal).toBeCloseTo(-100);
  });

  it('inga förslag när inget är klart bättre', () => {
    expect(suggestSwaps([logged(at(1), 200)], candidates, catalog)).toEqual([]);
  });

  it('hoppar över sparade måltider och alkohol', () => {
    const meal = { ...logged(at(0), 200), foodId: 'maltid:x' };
    expect(suggestSwaps([meal], candidates, catalog)).toEqual([]);
    expect(candidates.map((c) => c.food.name)).not.toContain('Vin rött vol. % 13');
  });
});

describe('swapText', () => {
  it('visar tecken och avrundar', () => {
    expect(
      swapText({
        entryId: 'a',
        fromName: 'X',
        toName: 'Y',
        toId: 'lv:1',
        grams: 100,
        deltaKcal: -119.6,
        deltaProteinG: 8.2,
        deltaFiberG: 0.3,
      }),
    ).toBe('Byt X mot Y: −120 kcal, +8 g protein');
  });
});
