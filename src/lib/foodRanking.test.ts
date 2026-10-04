import { describe, expect, it } from 'vitest';
import {
  collapseVariants,
  isOwn,
  searchPriority,
  usageScores,
  variantKey,
  variantLabel,
} from './foodRanking.ts';
import { buildIndex, searchIndex, type FoodItem, type FoodSource } from './foodSearch.ts';

const per100 = { kcal: 100, proteinG: 5, carbsG: 10, fatG: 2 };

function food(id: string, name: string, source: FoodSource = 'livsmedelsverket'): FoodItem {
  return { id, name, source, per100 };
}

describe('usageScores', () => {
  it('varje post ger 1 poäng som halveras var 30:e dag', () => {
    const scores = usageScores(
      [
        { foodId: 'a', date: '2026-10-04' },
        { foodId: 'a', date: '2026-10-04' },
        { foodId: 'b', date: '2026-09-04' },
        // Framtida poster räknas som idag.
        { foodId: 'c', date: '2026-10-10' },
      ],
      '2026-10-04',
    );
    expect(scores.get('a')).toBe(2);
    expect(scores.get('b')).toBeCloseTo(0.5);
    expect(scores.get('c')).toBe(1);
  });

  it('ofta och nyligen slår sällan och länge sedan', () => {
    const scores = usageScores(
      [
        { foodId: 'ofta', date: '2026-10-01' },
        { foodId: 'ofta', date: '2026-09-28' },
        { foodId: 'gammal', date: '2026-04-01' },
        { foodId: 'gammal', date: '2026-04-02' },
        { foodId: 'gammal', date: '2026-04-03' },
      ],
      '2026-10-04',
    );
    expect(scores.get('ofta') ?? 0).toBeGreaterThan(scores.get('gammal') ?? 0);
  });
});

describe('searchPriority och sökordningen', () => {
  it('egna och loggade får prioritet, övriga ingen', () => {
    const priority = searchPriority(new Map([['lv:2', 3]]));
    expect(priority(food('egen:x', 'X', 'egen'))).toBe(0);
    expect(priority(food('maltid:m', 'M', 'maltid'))).toBe(0);
    expect(priority(food('lv:2', 'Y'))).toBe(3);
    expect(priority(food('lv:3', 'Z'))).toBeNull();
    expect(isOwn({ source: 'recept' })).toBe(true);
    expect(isOwn({ source: 'fineli' })).toBe(false);
  });

  it('egna och nyligen loggade först, sedan exakt namnträff, sedan övriga', () => {
    const items = [
      food('lv:1', 'Mjölk'),
      food('lv:2', 'Mjölk mellan 1,5 %'),
      food('lv:3', 'Mjölkchoklad'),
      food('fi:4', 'Mjölk lätt'),
      food('egen:5', 'Mjölk havre hemma', 'egen'),
    ];
    const index = buildIndex(items);
    // Utan användning: exakt träff först.
    expect(searchIndex(index, 'mjölk', 10).map((f) => f.id)[0]).toBe('lv:1');
    const priority = searchPriority(
      usageScores(
        [
          { foodId: 'fi:4', date: '2026-10-03' },
          { foodId: 'fi:4', date: '2026-10-02' },
          { foodId: 'lv:3', date: '2026-08-01' },
        ],
        '2026-10-04',
      ),
    );
    expect(searchIndex(index, 'mjölk', 10, priority).map((f) => f.id)).toEqual([
      // Loggad oftast och senast, sedan loggad för länge sedan, sedan egen (aldrig loggad).
      'fi:4',
      'lv:3',
      'egen:5',
      // Exakt namnträff före övriga.
      'lv:1',
      'lv:2',
    ]);
  });

  it('en loggad träff byts inte mot samma livsmedel från en källa som rankas högre', () => {
    const index = buildIndex([food('lv:1', 'Rönnbär'), food('fi:1', 'Rönnbär', 'fineli')]);
    expect(searchIndex(index, 'rönnbär', 10).map((f) => f.id)).toEqual(['lv:1']);
    const priority = searchPriority(new Map([['fi:1', 1]]));
    expect(searchIndex(index, 'rönnbär', 10, priority).map((f) => f.id)).toEqual(['fi:1']);
  });
});

describe('varianter', () => {
  it('nyckeln är de två första betydelsebärande orden, utan tal och småord', () => {
    expect(variantKey('Bröd fullkorn råg')).toBe('brod fullkorn');
    expect(variantKey('Bröd, fullkorn, vete osötat')).toBe('brod fullkorn');
    expect(variantKey('Mjölk 3 % fett')).toBe('mjolk fett');
    expect(variantKey('Ost')).toBe('ost');
    expect(variantLabel('Bröd, fullkorn, vete osötat')).toBe('Bröd fullkorn');
  });

  const breads = [
    food('lv:1', 'Bröd fullkorn råg'),
    food('lv:2', 'Bröd fullkorn vete'),
    food('lv:3', 'Bröd fullkorn havre'),
    food('lv:4', 'Bröd fullkorn dinkel'),
    food('lv:5', 'Bröd fullkorn korn'),
    food('lv:6', 'Bröd vitt'),
  ];

  it('visar högst tre per variant och sedan en rad "Visa fler varianter"', () => {
    const rows = collapseVariants(breads);
    expect(rows.map((r) => (r.kind === 'item' ? r.item.id : `fler:${String(r.hidden)}`))).toEqual([
      'lv:1',
      'lv:2',
      'lv:3',
      'fler:2',
      'lv:6',
    ]);
    const more = rows[3];
    expect(more?.kind === 'more' && more.label).toBe('Bröd fullkorn');
    expect(more?.kind === 'more' && more.key).toBe('brod fullkorn');
  });

  it('en utfälld variant visas helt', () => {
    const rows = collapseVariants(breads, { expanded: new Set(['brod fullkorn']) });
    expect(rows.every((r) => r.kind === 'item')).toBe(true);
    expect(rows).toHaveLength(6);
  });

  it('skyddade (egna och loggade) räknas inte och fälls aldrig ihop', () => {
    const rows = collapseVariants(breads, { protect: (f) => f.id === 'lv:1' || f.id === 'lv:5' });
    expect(rows.map((r) => (r.kind === 'item' ? r.item.id : 'fler'))).toEqual([
      'lv:1',
      'lv:2',
      'lv:3',
      'lv:4',
      'lv:5',
      'lv:6',
    ]);
  });

  it('begränsar antalet livsmedel (raden "Visa fler" räknas inte)', () => {
    const rows = collapseVariants(breads, { limit: 3 });
    expect(rows.map((r) => r.kind)).toEqual(['item', 'item', 'item', 'more']);
  });
});
