import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROTEIN_FACTOR,
  PROTEIN_FACTORS,
  isProteinRich,
  isValidProteinFactor,
  proteinGoalFor,
  proteinGoalG,
} from './protein.ts';

describe('proteinmål', () => {
  it('är faktor × målvikt, standardfaktor 1,6', () => {
    expect(DEFAULT_PROTEIN_FACTOR).toBe(1.6);
    expect(proteinGoalG(80)).toBe(128);
    expect(proteinGoalG(80, 1.2)).toBe(96);
    expect(proteinGoalG(80, 2.0)).toBe(160);
  });

  it('avrundar till hela gram', () => {
    expect(proteinGoalG(72.5, 1.6)).toBe(116);
    expect(proteinGoalG(65.3, 1.3)).toBe(85);
  });

  it('faktorer utanför 1,2–2,0 ger standardfaktorn', () => {
    expect(proteinGoalG(80, 1.1)).toBe(128);
    expect(proteinGoalG(80, 2.1)).toBe(128);
    expect(proteinGoalG(80, 1.65)).toBe(128);
    expect(proteinGoalG(80, Number.NaN)).toBe(128);
  });

  it('saknar mål utan rimlig målvikt', () => {
    expect(proteinGoalG(0)).toBeNull();
    expect(proteinGoalG(-5)).toBeNull();
    expect(proteinGoalFor(null)).toBeNull();
  });

  it('läser faktorn ur profilen', () => {
    expect(proteinGoalFor({ goalWeightKg: 70 })).toBe(112);
    expect(proteinGoalFor({ goalWeightKg: 70, proteinFactor: 1.8 })).toBe(126);
  });

  it('valbara faktorer är 1,2–2,0 i steg om 0,1', () => {
    expect(PROTEIN_FACTORS).toEqual([1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0]);
    expect(isValidProteinFactor(1.7)).toBe(true);
    expect(isValidProteinFactor('1.7')).toBe(false);
    expect(isValidProteinFactor(1.25)).toBe(false);
  });
});

describe('proteinrikt livsmedel', () => {
  it('kräver minst 15 g protein per 100 kcal', () => {
    // Kvarg: 11 g / 65 kcal ≈ 16,9 g per 100 kcal.
    expect(isProteinRich({ kcal: 65, proteinG: 11 })).toBe(true);
    // Precis på gränsen.
    expect(isProteinRich({ kcal: 100, proteinG: 15 })).toBe(true);
    expect(isProteinRich({ kcal: 200, proteinG: 30 })).toBe(true);
    // Strax under.
    expect(isProteinRich({ kcal: 100, proteinG: 14.9 })).toBe(false);
    // Ost: 27 g / 350 kcal ≈ 7,7 g per 100 kcal.
    expect(isProteinRich({ kcal: 350, proteinG: 27 })).toBe(false);
  });

  it('livsmedel utan energi eller protein räknas inte', () => {
    expect(isProteinRich({ kcal: 0, proteinG: 0 })).toBe(false);
    expect(isProteinRich({ kcal: 0, proteinG: 5 })).toBe(false);
    expect(isProteinRich({ kcal: 50, proteinG: 0 })).toBe(false);
  });
});
