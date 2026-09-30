import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROTEIN_FACTOR,
  PROTEIN_FACTORS,
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
