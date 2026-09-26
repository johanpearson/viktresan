import { describe, expect, it } from 'vitest';
import { STANDARD_UNIT_RULES } from '../data/units.ts';
import {
  GRAM,
  amountLabel,
  gramsPerUnit,
  initialUsage,
  lastUsage,
  loggedAmountText,
  mergeUnits,
  parseCustomUnit,
  parseServing,
  parseUnitAmount,
  standardUnitsFor,
  toGrams,
  unitsFor,
  type FoodUnit,
} from './units.ts';

const egg = { id: 'lv:2205', name: 'Ägg kokt' };
const st = (grams: number, source: FoodUnit['source'] = 'egen'): FoodUnit => ({
  name: 'st',
  grams,
  source,
});

describe('omräkning', () => {
  it('mängd × gram per enhet, avrundat till 0,1 g', () => {
    expect(toGrams(2, 60)).toBe(120);
    expect(toGrams(0.5, 35)).toBe(17.5);
    expect(toGrams(1 / 3, 100)).toBe(33.3);
  });

  it('tolkar mängden i vald enhet', () => {
    const units = standardUnitsFor(egg);
    expect(parseUnitAmount('2', 'st', units)).toEqual({
      ok: true,
      value: { amount: 2, unit: 'st', grams: 120 },
    });
    expect(parseUnitAmount('0,5', 'st', units)).toMatchObject({ value: { grams: 30 } });
    expect(parseUnitAmount('150', GRAM, units)).toEqual({
      ok: true,
      value: { amount: 150, unit: 'g', grams: 150 },
    });
    expect(parseUnitAmount('0', 'st', units)).toMatchObject({ ok: false });
    expect(parseUnitAmount('abc', 'g', units)).toMatchObject({ ok: false });
    expect(parseUnitAmount('6000', 'g', units)).toMatchObject({ ok: false });
    expect(parseUnitAmount('90', 'st', units)).toMatchObject({ ok: false }); // 5 400 g
    expect(parseUnitAmount('1', 'skiva', units)).toMatchObject({ ok: false }); // okänd enhet
  });

  it('gram finns alltid och skiftläge spelar ingen roll', () => {
    expect(gramsPerUnit([], 'g')).toBe(1);
    expect(gramsPerUnit([], 'gram')).toBe(1);
    expect(gramsPerUnit([st(60)], 'ST')).toBe(60);
    expect(gramsPerUnit([st(60)], 'dl')).toBeNull();
  });

  it('formaterar mängder', () => {
    expect(amountLabel(2, 'st')).toBe('2 st');
    expect(amountLabel(0.5, 'skiva')).toBe('0,5 skiva');
    expect(loggedAmountText({ amount: 2, unit: 'st', grams: 120 })).toBe('2 st (120 g)');
    expect(loggedAmountText({ amount: 150, unit: 'g', grams: 150 })).toBe('150 g');
  });
});

describe('standardenheter', () => {
  it('matchar Livsmedelsverkets livsmedel på namnmönster', () => {
    const cases: [string, string, number][] = [
      ['Ägg kokt', 'st', 60],
      ['Ägg rått eko.', 'st', 60],
      ['Banan', 'st', 120],
      ['Äpple m. skal', 'st', 150],
      ['Bröd vitt fibrer ca 5% typ formfranska', 'skiva', 35],
      ['Hårt bröd fullkorn råg fibrer ca 14% typ rutknäcke', 'skiva', 12],
      ['Ost hårdost fett 28%', 'skiva', 10],
      ['Mellanmjölk fett 1,5% berikad', 'dl', 103],
      ['Filmjölk fett 3% berikad', 'dl', 105],
      ['Havregryn fullkorn', 'dl', 35],
      ['Ris jasmin okokt', 'dl', 85],
      ['Ris jasmin kokt m. salt', 'dl', 70],
      ['Pasta fullkorn okokt', 'dl', 40],
      ['Pasta kokt m. salt', 'dl', 60],
      ['Smör fett 80%', 'msk', 14],
      ['Rapsolja', 'tsk', 4.5],
      ['Socker', 'msk', 13],
      ['Hallonsylt', 'msk', 20],
    ];
    for (const [name, unit, grams] of cases) {
      const units = standardUnitsFor({ id: 'lv:999999', name });
      expect(gramsPerUnit(units, unit), name).toBe(grams);
      expect(units.every((u) => u.source === 'standard')).toBe(true);
    }
  });

  it('matchar inte tillagat, torkat eller liknande namn', () => {
    for (const name of [
      'Banan friterad',
      'Äpple torkat',
      'Äggakaka',
      'Potatis råstekt',
      'Ost hårdost parmesan fett 30% typ Parmiggiano Reggiano',
      'Syltlök inlagd',
      'Bröd vitt vetetortilla',
    ]) {
      expect(standardUnitsFor({ id: 'lv:999999', name }), name).toEqual([]);
    }
    expect(gramsPerUnit(standardUnitsFor({ id: 'lv:1', name: 'Havregrynsgröt' }), 'dl')).toBe(105);
  });

  it('gäller bara Livsmedelsverket och kan matcha på nummer', () => {
    expect(standardUnitsFor({ id: 'egen:x', name: 'Ägg kokt' })).toEqual([]);
    const rules = [{ label: 'test', ids: [42], units: [{ name: 'burk', grams: 400 }] }];
    expect(standardUnitsFor({ id: 'lv:42', name: 'Vad som helst' }, rules)).toEqual([
      { name: 'burk', grams: 400, source: 'standard' },
    ]);
  });

  it('tabellen har rimliga värden', () => {
    for (const rule of STANDARD_UNIT_RULES) {
      expect(rule.units.length, rule.label).toBeGreaterThan(0);
      for (const u of rule.units) {
        expect(u.grams, `${rule.label} ${u.name}`).toBeGreaterThan(0);
        expect(u.grams, `${rule.label} ${u.name}`).toBeLessThanOrEqual(500);
      }
    }
  });
});

describe('enheter per livsmedel', () => {
  it('egna enheter ersätter standardenheter med samma namn', () => {
    expect(unitsFor(egg, [st(70)])).toEqual([st(70)]);
    expect(unitsFor(egg, [{ name: 'halvt', grams: 30, source: 'egen' }])).toEqual([
      st(60, 'standard'),
      { name: 'halvt', grams: 30, source: 'egen' },
    ]);
  });

  it('livsmedlets egna enheter (Open Food Facts) kommer först, gram tas bort', () => {
    const off: FoodUnit = { name: 'portion', grams: 30, source: 'openfoodfacts' };
    expect(
      unitsFor({ id: 'off:1', name: 'X', units: [off] }, [{ name: 'g', grams: 1, source: 'egen' }]),
    ).toEqual([off]);
    expect(mergeUnits([st(60, 'standard')], [{ ...st(80), name: 'ST' }])).toEqual([
      { name: 'ST', grams: 80, source: 'egen' },
    ]);
  });

  it('kommer ihåg senast använda enhet och mängd', () => {
    const log = [
      { foodId: 'lv:1', unit: 'st', amount: 2, createdAt: 1 },
      { foodId: 'lv:1', unit: 'g', amount: 150, createdAt: 3 },
      { foodId: 'lv:1', unit: 'skiva', amount: 1, createdAt: 2, updatedAt: 4 },
      { foodId: 'lv:2', unit: 'dl', amount: 3, createdAt: 9 },
    ];
    expect(lastUsage(log, 'lv:1')).toEqual({ unit: 'skiva', amount: 1 });
    expect(lastUsage(log, 'lv:3')).toBeNull();
  });

  it('förifyller senast använda, annars första enheten, annars 100 g', () => {
    const units = [st(60)];
    expect(initialUsage(units, { unit: 'st', amount: 3 })).toEqual({ unit: 'st', amount: 3 });
    expect(initialUsage(units, { unit: 'g', amount: 80 })).toEqual({ unit: 'g', amount: 80 });
    // Enheten finns inte längre.
    expect(initialUsage(units, { unit: 'skiva', amount: 2 })).toEqual({ unit: 'st', amount: 1 });
    expect(initialUsage([], null)).toEqual({ unit: 'g', amount: 100 });
  });
});

describe('parseCustomUnit', () => {
  it('godkänner namn och gram', () => {
    expect(parseCustomUnit(' burk ', '400', [])).toEqual({
      ok: true,
      value: { name: 'burk', grams: 400, source: 'egen' },
    });
    expect(parseCustomUnit('st', '62,5', [])).toMatchObject({ value: { grams: 62.5 } });
  });

  it('underkänner tomt namn, gram, dubbletter och orimlig vikt', () => {
    expect(parseCustomUnit('', '10', [])).toMatchObject({ ok: false });
    expect(parseCustomUnit('g', '10', [])).toMatchObject({ ok: false });
    expect(parseCustomUnit('Gram', '10', [])).toMatchObject({ ok: false });
    expect(parseCustomUnit('ST', '10', [st(60)])).toMatchObject({ ok: false });
    expect(parseCustomUnit('burk', '0', [])).toMatchObject({ ok: false });
    expect(parseCustomUnit('burk', '6000', [])).toMatchObject({ ok: false });
    expect(parseCustomUnit('x'.repeat(21), '10', [])).toMatchObject({ ok: false });
  });
});

describe('parseServing (Open Food Facts)', () => {
  it('tolkar gram ur serving_size', () => {
    expect(parseServing('30 g', undefined)).toBe(30);
    expect(parseServing('30g', undefined)).toBe(30);
    expect(parseServing('1 portion (30 g)', 30)).toBe(30);
    expect(parseServing('2 skivor (25,5 g)', undefined)).toBe(25.5);
    expect(parseServing('1 bar 45 gram', undefined)).toBe(45);
    expect(parseServing('0.25 kg', undefined)).toBe(250);
  });

  it('använder serving_quantity när texten saknas eller saknar gram', () => {
    expect(parseServing(undefined, 40)).toBe(40);
    expect(parseServing('', '40')).toBe(40);
    expect(parseServing('1 skål', 40, 'g')).toBe(40);
    expect(parseServing(undefined, 40, 'g')).toBe(40);
  });

  it('räknar inte om volym och avvisar orimliga värden', () => {
    expect(parseServing('250 ml', 250)).toBeNull();
    expect(parseServing('1 glas (2 dl)', 200)).toBeNull();
    expect(parseServing(undefined, 250, 'ml')).toBeNull();
    expect(parseServing('en näve', undefined)).toBeNull();
    expect(parseServing(undefined, 0)).toBeNull();
    expect(parseServing(undefined, -5)).toBeNull();
    expect(parseServing('10000 g', undefined)).toBeNull();
    expect(parseServing(undefined, 'abc')).toBeNull();
  });
});
