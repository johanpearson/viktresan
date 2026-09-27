import { describe, expect, it } from 'vitest';
import {
  IU_PER_UG_VITAMIN_D,
  SUPPLEMENT_NUTRIENTS,
  convertAmount,
  isUnitAllowed,
  parseAmountUnit,
  toCanonical,
  unitsFor,
} from './nutrientUnits.ts';

describe('enhetsomräkning', () => {
  it('D-vitamin: IE ↔ µg (1 µg = 40 IE)', () => {
    expect(IU_PER_UG_VITAMIN_D).toBe(40);
    expect(convertAmount('vitaminD', 1000, 'IE', 'µg')).toBe(25);
    expect(convertAmount('vitaminD', 25, 'µg', 'IE')).toBe(1000);
    expect(convertAmount('vitaminD', 0.05, 'mg', 'IE')).toBe(2000);
    expect(toCanonical('vitaminD', 400, 'IE')).toBe(10);
  });

  it('mg ↔ µg ↔ g utan flyttalsbrus', () => {
    expect(convertAmount('zinc', 5000, 'µg', 'mg')).toBe(5);
    expect(convertAmount('selenium', 0.1, 'mg', 'µg')).toBe(100);
    expect(convertAmount('calcium', 0.8, 'g', 'mg')).toBe(800);
    expect(convertAmount('iodine', 0.00015, 'g', 'µg')).toBe(150);
    expect(toCanonical('vitaminB12', 0.0025, 'mg')).toBe(2.5);
    expect(toCanonical('iron', 14, 'mg')).toBe(14);
  });

  it('IE går bara för D-vitamin', () => {
    expect(convertAmount('vitaminA', 1000, 'IE', 'µg')).toBeNull();
    expect(convertAmount('zinc', 1, 'mg', 'IE')).toBeNull();
    expect(isUnitAllowed('vitaminD', 'IE')).toBe(true);
    expect(isUnitAllowed('vitaminE', 'IE')).toBe(false);
    expect(isUnitAllowed('vitaminE', 'mg')).toBe(true);
  });

  it('enheterna i formuläret: egen enhet, och IE för D-vitamin', () => {
    expect(unitsFor('vitaminD')).toEqual(['µg', 'IE']);
    expect(unitsFor('magnesium')).toEqual(['mg']);
    expect(unitsFor('folate')).toEqual(['µg']);
  });

  it('tolkar enheter som de skrivs på etiketter', () => {
    expect(parseAmountUnit('mcg')).toBe('µg');
    expect(parseAmountUnit('μg')).toBe('µg');
    expect(parseAmountUnit(' ug ')).toBe('µg');
    expect(parseAmountUnit('IU')).toBe('IE');
    expect(parseAmountUnit('i.e.')).toBe('IE');
    expect(parseAmountUnit('MG')).toBe('mg');
    expect(parseAmountUnit('kg')).toBeNull();
    expect(parseAmountUnit('')).toBeNull();
  });

  it('tillskott kan innehålla vitaminer och mineraler men inte fiber eller salt', () => {
    const keys = SUPPLEMENT_NUTRIENTS.map((n) => n.key);
    expect(keys).toContain('vitaminD');
    expect(keys).toContain('iodine');
    expect(keys).not.toContain('fiberG');
    expect(keys).not.toContain('saltG');
  });
});
