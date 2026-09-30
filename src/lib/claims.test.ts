import { describe, expect, it } from 'vitest';
import type { SavedMeal } from '../db/db.ts';
import {
  claimFactsFor,
  claimsFor,
  isFiberRich,
  isLowEnergy,
  isProteinRich,
  nutritionClaims,
} from './claims.ts';
import type { FiberSource } from './fiber.ts';
import type { FoodItem } from './foodSearch.ts';

const facts = (kcal: number | null, proteinG: number | null, fiberG: number | null = null) => ({
  kcal,
  proteinG,
  fiberG,
  liquid: false,
});

describe('Proteinrik (≥ 20 % av energin från protein)', () => {
  it('precis på gränsen och strax under', () => {
    // 5 g × 4 kcal = 20 kcal av 100 kcal = 20 %.
    expect(isProteinRich(facts(100, 5))).toBe(true);
    expect(isProteinRich(facts(100, 4.99))).toBe(false);
    // Avrundningsfel ska inte flytta gränsen: 0,2 × 4 / 4 = 20 %.
    expect(isProteinRich(facts(4, 0.2))).toBe(true);
  });

  it('kvarg och ost är proteinrika, bröd är det inte', () => {
    expect(isProteinRich(facts(65, 11))).toBe(true);
    expect(isProteinRich(facts(350, 27))).toBe(true); // 31 %
    expect(isProteinRich(facts(250, 9))).toBe(false); // 14 %
  });

  it('ingen etikett utan energi eller protein', () => {
    expect(isProteinRich(facts(null, 10))).toBe(false);
    expect(isProteinRich(facts(100, null))).toBe(false);
    expect(isProteinRich(facts(0, 5))).toBe(false);
    expect(isProteinRich(facts(50, 0))).toBe(false);
  });
});

describe('Fiberrik (≥ 6 g/100 g eller ≥ 3 g/100 kcal)', () => {
  it('6 g per 100 g räcker oavsett energi', () => {
    expect(isFiberRich(facts(370, 0, 6))).toBe(true);
    expect(isFiberRich(facts(370, 0, 5.9))).toBe(false); // 1,6 g/100 kcal
    // Även utan känd energi.
    expect(isFiberRich(facts(null, null, 6))).toBe(true);
  });

  it('3 g per 100 kcal räcker under 6 g per 100 g', () => {
    expect(isFiberRich(facts(100, 0, 3))).toBe(true); // precis på gränsen
    expect(isFiberRich(facts(34, 3, 2.6))).toBe(true); // broccoli: 7,6 g/100 kcal
    expect(isFiberRich(facts(100, 0, 2.99))).toBe(false);
  });

  it('ingen etikett utan fiberdata', () => {
    expect(isFiberRich(facts(100, 3, null))).toBe(false);
    expect(isFiberRich(facts(100, 3, 0))).toBe(false);
    expect(isFiberRich(facts(null, null, 2))).toBe(false);
    expect(isFiberRich(facts(0, 0, 2))).toBe(false);
  });
});

describe('Energisnål (≤ 40 kcal/100 g, ≤ 20 kcal/100 ml för drycker)', () => {
  it('fast livsmedel: gränsen 40 kcal', () => {
    expect(isLowEnergy({ kcal: 40, liquid: false })).toBe(true);
    expect(isLowEnergy({ kcal: 40.5, liquid: false })).toBe(false);
    expect(isLowEnergy({ kcal: 0, liquid: false })).toBe(true);
  });

  it('dryck: gränsen 20 kcal', () => {
    expect(isLowEnergy({ kcal: 20, liquid: true })).toBe(true);
    expect(isLowEnergy({ kcal: 21, liquid: true })).toBe(false);
    expect(isLowEnergy({ kcal: 30, liquid: false })).toBe(true);
  });

  it('ingen etikett utan känd energi', () => {
    expect(isLowEnergy({ kcal: null, liquid: false })).toBe(false);
  });
});

describe('nutritionClaims', () => {
  it('flera etiketter i visningsordning', () => {
    // Broccoli: 34 kcal, 2,8 g protein (33 %), 2,6 g fiber.
    expect(nutritionClaims(facts(34, 2.8, 2.6))).toEqual(['proteinrik', 'fiberrik', 'energisnal']);
    expect(nutritionClaims(facts(500, 5, null))).toEqual([]);
  });
});

describe('claimsFor (livsmedel, drycker, måltider)', () => {
  const food = (patch: Partial<FoodItem>): FoodItem => ({
    id: 'lv:1',
    name: 'Livsmedel',
    source: 'livsmedelsverket',
    per100: { kcal: 100, proteinG: 1, carbsG: 20, fatG: 1 },
    ...patch,
  });

  it('saknat protein (Open Food Facts) ger ingen Proteinrik', () => {
    const off = food({
      id: 'off:1',
      source: 'openfoodfacts',
      per100: { kcal: 30, proteinG: 0, carbsG: 0, fatG: 0 },
      missing: ['proteinG'],
    });
    expect(claimFactsFor(off, null)).toMatchObject({ proteinG: null });
    expect(claimsFor(off, null)).toEqual(['energisnal']);
  });

  it('per 100 ml gäller dryckens gräns', () => {
    const juice = food({ per100Unit: 'ml', per100: { kcal: 30, proteinG: 0, carbsG: 7, fatG: 0 } });
    expect(claimsFor(juice, null)).toEqual([]);
    expect(claimsFor({ ...juice, per100: { ...juice.per100, kcal: 18 } }, null)).toEqual([
      'energisnal',
    ]);
  });

  it('snabbloggar har inga etiketter', () => {
    expect(claimsFor(food({ id: 'snabb:x:30:0', source: 'snabb' }), null)).toEqual([]);
  });

  it('måltid: fiber ur ingredienserna, andelarna per portion', () => {
    const meal: SavedMeal = {
      id: 'm1',
      name: 'Gröt',
      items: [
        {
          foodId: 'lv:2',
          name: 'Havregryn',
          amount: 100,
          unit: 'g',
          grams: 100,
          per100: { kcal: 370, proteinG: 13, carbsG: 60, fatG: 7 },
        },
      ],
      createdAt: 1,
    };
    const item: FoodItem = {
      id: 'maltid:m1',
      name: 'Gröt',
      source: 'maltid',
      per100: { kcal: 370, proteinG: 13, carbsG: 60, fatG: 7 },
      units: [{ name: 'portion', grams: 100, source: 'egen' }],
    };
    const source: FiberSource = {
      meals: [meal],
      lookup: (id) => (id === 'lv:2' ? { fiberG: 11 } : undefined),
    };
    // 11 g per 100 g → fiberrik; protein 14 % → inte proteinrik.
    expect(claimsFor(item, source)).toEqual(['fiberrik']);
    // Utan fiberdata ingen etikett.
    expect(claimsFor(item, null)).toEqual([]);
    expect(claimsFor(item, { meals: [meal], lookup: () => undefined })).toEqual([]);
  });
});
