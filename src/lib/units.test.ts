import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_RULES, type FoodCategory } from '../data/foodCategories.ts';
import { STANDARD_UNIT_RULES } from '../data/units.ts';
import {
  GRAM,
  VOLUME_UNITS,
  amountLabel,
  builtInUnits,
  categoryFromGroup,
  categoryFromName,
  confirmGuess,
  foodProfile,
  gramsPerUnit,
  guessQuestion,
  initialUsage,
  isGuess,
  lastUsage,
  loggedAmountText,
  mergeUnits,
  parseCustomUnit,
  parsePackage,
  parseServing,
  parseUnitAmount,
  toGrams,
  unitsFor,
  volumeMl,
  volumeToGrams,
  type FoodUnit,
} from './units.ts';

const egg = { id: 'lv:2205', name: 'Ägg kokt' };
const st = (grams: number, source: FoodUnit['source'] = 'egen'): FoodUnit => ({
  name: 'st',
  grams,
  source,
});
const lv = (name: string, group?: string) => ({
  id: 'lv:999999',
  name,
  ...(group === undefined ? {} : { group }),
});
const names = (units: readonly FoodUnit[]) => units.map((u) => u.name);

describe('omräkning', () => {
  it('mängd × gram per enhet, avrundat till 0,1 g', () => {
    expect(toGrams(2, 60)).toBe(120);
    expect(toGrams(0.5, 35)).toBe(17.5);
    expect(toGrams(1 / 3, 100)).toBe(33.3);
  });

  it('tolkar mängden i vald enhet', () => {
    const units = unitsFor(egg);
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

  it('volym i ml/cl får vara mer än 100 men högst 5 000 g', () => {
    const units = unitsFor(lv('Läsk'));
    expect(parseUnitAmount('330', 'ml', units)).toMatchObject({ value: { grams: 330 } });
    expect(parseUnitAmount('6', 'l', units)).toMatchObject({ ok: false });
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
    expect(loggedAmountText({ amount: 33, unit: 'cl', grams: 330, per100Unit: 'ml' })).toBe(
      '33 cl (330 ml)',
    );
  });
});

describe('volymenheter', () => {
  it('har fasta mått i ml', () => {
    expect(VOLUME_UNITS).toEqual({
      ml: 1,
      krm: 1,
      tsk: 5,
      cl: 10,
      msk: 15,
      dl: 100,
      kopp: 150,
      glas: 200,
      l: 1000,
    });
    expect(volumeMl('DL')).toBe(100);
    expect(volumeMl('st')).toBeNull();
  });

  it('räknar om volym till gram med densitet', () => {
    const cases: [number, string, number, number][] = [
      [1, 'ml', 1, 1],
      [33, 'cl', 1, 330],
      [2, 'dl', 1.03, 206],
      [1, 'l', 1, 1000],
      [1, 'tsk', 0.93, 4.7],
      [1, 'msk', 0.92, 13.8],
      [3, 'krm', 1.2, 3.6],
      [1, 'glas', 1, 200],
      [1, 'kopp', 1, 150],
      [1.5, 'dl', 0.35, 52.5],
    ];
    for (const [amount, unit, density, grams] of cases) {
      expect(volumeToGrams(amount, unit, density), `${String(amount)} ${unit}`).toBe(grams);
    }
    expect(volumeToGrams(1, 'st', 1)).toBeNull();
  });

  it('volymenheterna för ett livsmedel följer densiteten', () => {
    const cases: [string, string, number][] = [
      ['Mellanmjölk fett 1,5% berikad', 'dl', 103],
      ['Mellanmjölk fett 1,5% berikad', 'glas', 206],
      ['Läsk', 'cl', 10],
      ['Filmjölk fett 3% berikad', 'dl', 105],
      ['Havregryn fullkorn', 'dl', 35],
      ['Ris jasmin okokt', 'dl', 85],
      ['Ris jasmin kokt m. salt', 'dl', 70],
      ['Pasta fullkorn okokt', 'dl', 40],
      ['Pasta kokt m. salt', 'dl', 60],
      ['Vetemjöl', 'msk', 9],
      ['Smör fett 80%', 'msk', 14],
      ['Rapsolja', 'msk', 13.8],
      ['Socker', 'tsk', 4.3],
      ['Hallonsylt', 'msk', 19.5],
      ['Honung', 'msk', 21],
      ['Vispgrädde fett 36%', 'msk', 15],
      ['Havregrynsgröt', 'dl', 105],
    ];
    for (const [name, unit, grams] of cases) {
      const units = unitsFor(lv(name));
      expect(gramsPerUnit(units, unit), `${name} ${unit}`).toBe(grams);
      expect(units.find((u) => u.name === unit)?.source).toBe('volym');
    }
  });
});

describe('kategorier och densitet', () => {
  it('mappar namn till kategori', () => {
    const cases: [string, FoodCategory][] = [
      ['Läsk', 'dryck'],
      ['Läsk cola light', 'dryck'],
      ['Apelsinjuice drickf.', 'dryck'],
      ['Öl starköl', 'dryck'],
      ['Mjölk fett 3 %', 'mjolk'],
      ['Havredryck berikad', 'mjolk'],
      ['Filmjölk fett 3% berikad', 'fil'],
      ['Yoghurt naturell fett 3%', 'fil'],
      ['Vispgrädde fett 36%', 'gradde'],
      ['Crème fraiche fett 34%', 'gradde'],
      ['Rapsolja', 'olja'],
      ['Bordsmargarin fett 80%', 'matfett'],
      ['Vetemjöl', 'mjol'],
      ['Socker', 'socker'],
      ['Lingonsylt', 'sott'],
      ['Havregryn fullkorn', 'gryn'],
      ['Frukostflingor cornflakes', 'gryn'],
      ['Ris jasmin okokt', 'okokt'],
      ['Ris jasmin kokt m. salt', 'kokt'],
      ['Havregrynsgröt', 'grot'],
      ['Bröd vitt fibrer ca 5% typ formfranska', 'brod'],
      ['Hårt bröd fullkorn råg', 'brod'],
      ['Ost hårdost fett 28%', 'ost'],
      ['Ägg kokt', 'agg'],
      ['Banan', 'frukt'],
      ['Blåbär', 'bar'],
      ['Broccoli', 'gronsak'],
      ['Potatis kokt', 'potatis'],
      ['Nöt entrecote rå', 'kott'],
      ['Kyckling bröstfilé rå', 'kott'],
      ['Lax odlad rå', 'fisk'],
      ['Falukorv', 'korv'],
      ['Tomatsoppa', 'soppa'],
      ['Bearnaisesås', 'sas'],
      ['Köttfärssås', 'sas'],
      ['Lasagne', 'ratt'],
      ['Cashewnötter', 'notter'],
      ['Mjölkchoklad', 'godis'],
      ['Kanelbulle', 'bakverk'],
      ['Glass vanilj', 'glass'],
      ['Kanel', 'kryddor'],
    ];
    for (const [name, category] of cases) {
      expect(categoryFromName(name), name).toBe(category);
    }
    expect(categoryFromName('Något helt okänt')).toBeNull();
  });

  it('mappar Livsmedelsverkets livsmedelsgrupper till kategori', () => {
    const cases: [string, FoodCategory][] = [
      ['Drycker', 'dryck'],
      ['Läsk', 'dryck'],
      ['Mjölk', 'mjolk'],
      ['Fil och yoghurt', 'fil'],
      ['Grädde', 'gradde'],
      ['Ost', 'ost'],
      ['Fett, olja', 'olja'],
      ['Matfett', 'matfett'],
      ['Bröd', 'brod'],
      ['Mjöl, gryn, flingor', 'gryn'],
      ['Ris', 'okokt'],
      ['Frukt, bär', 'frukt'],
      ['Grönsaker, baljväxter', 'gronsak'],
      ['Potatis', 'potatis'],
      ['Kött', 'kott'],
      ['Fågel', 'kott'],
      ['Korv', 'korv'],
      ['Fisk, skaldjur', 'fisk'],
      ['Ägg', 'agg'],
      ['Socker, sötningsmedel', 'socker'],
      ['Godis', 'godis'],
      ['Kakor, bakverk', 'bakverk'],
      ['Soppor', 'soppa'],
      ['Såser', 'sas'],
      ['Nötter, frön', 'notter'],
      ['Kryddor', 'kryddor'],
      ['Rätter', 'ratt'],
    ];
    for (const [group, category] of cases) {
      expect(categoryFromGroup(group), group).toBe(category);
    }
    expect(categoryFromGroup('Ris', 'Ris vitt kokt')).toBe('kokt');
    expect(categoryFromGroup('')).toBeNull();
    expect(categoryFromGroup('Okänd grupp')).toBeNull();
  });

  it('namnet går före gruppen, gruppen före övrigt', () => {
    expect(foodProfile(lv('Läsk', 'Kött')).category).toBe('dryck');
    expect(foodProfile(lv('Xyz', 'Drycker'))).toEqual({
      category: 'dryck',
      density: 1,
      standard: [],
    });
    expect(foodProfile(lv('Xyz'))).toMatchObject({ category: 'ovrigt', density: 1 });
  });

  it('livsmedlets egen densitet går före kategorins', () => {
    expect(foodProfile(lv('Havregryn fullkorn'))).toMatchObject({
      category: 'gryn',
      density: 0.35,
    });
    expect(foodProfile(lv('Korngryn'))).toMatchObject({ category: 'gryn', density: 0.4 });
    expect(foodProfile(lv('Mjölk fett 3 %'))).toMatchObject({ density: 1.03 });
    expect(foodProfile(lv('Nöt entrecote rå'))).toMatchObject({ density: null });
  });

  it('per 100 ml räknas direkt i volym utan densitet', () => {
    const cola = { id: 'off:1', name: 'Cola', per100Unit: 'ml' as const };
    expect(foodProfile(cola)).toEqual({ category: 'dryck', density: 1, standard: [] });
    expect(gramsPerUnit(unitsFor(cola), 'cl')).toBe(10);
    // Även för en kategori med annan densitet (grädde 1,0, olja 0,92 …).
    const oil = { id: 'off:2', name: 'Rapsolja', per100Unit: 'ml' as const };
    expect(gramsPerUnit(unitsFor(oil), 'msk')).toBe(15);
    expect(loggedAmountText({ amount: 2, unit: 'msk', grams: 30, per100Unit: 'ml' })).toBe(
      '2 msk (30 ml)',
    );
  });

  it('kategoritabellen har rimliga värden', () => {
    for (const [id, info] of Object.entries(CATEGORIES)) {
      if (info.density !== null) {
        expect(info.density, id).toBeGreaterThan(0.1);
        expect(info.density, id).toBeLessThan(1.5);
      }
      for (const name of info.units) {
        const known = volumeMl(name) !== null || info.pieces[name] !== undefined;
        expect(known, `${id} ${name}`).toBe(true);
        if (volumeMl(name) !== null) expect(info.density, `${id} ${name}`).not.toBeNull();
      }
      for (const grams of Object.values(info.pieces)) {
        expect(grams, id).toBeGreaterThan(0);
        expect(grams, id).toBeLessThanOrEqual(500);
      }
    }
    for (const rule of CATEGORY_RULES) expect(rule.pattern.test(''), rule.category).toBe(false);
  });
});

describe('relevanta enheter', () => {
  it('visar bara enheter som passar kategorin', () => {
    expect(names(unitsFor(lv('Läsk')))).toEqual(['cl', 'dl', 'glas', 'ml', 'l']);
    expect(names(unitsFor(lv('Mjölk fett 3 %')))).toEqual(['dl', 'glas', 'cl', 'ml', 'msk']);
    expect(names(unitsFor(lv('Bröd vitt fibrer ca 5% typ formfranska')))).toEqual(['skiva', 'st']);
    expect(names(unitsFor(egg))).toEqual(['st']);
    expect(names(unitsFor(lv('Banan')))).toEqual(['st', 'bit']);
    expect(names(unitsFor(lv('Smör fett 80%')))).toEqual(['msk', 'tsk']);
    expect(names(unitsFor(lv('Nöt entrecote rå')))).toEqual(['portion', 'bit']);
    // Inga volymer för bröd, kött och ägg.
    for (const food of [
      lv('Bröd vitt fibrer ca 5% typ formfranska'),
      lv('Nöt entrecote rå'),
      egg,
    ]) {
      expect(unitsFor(food).some((u) => u.source === 'volym')).toBe(false);
    }
  });

  it('standardvikter går före gissningar och övriga standardenheter läggs till', () => {
    expect(builtInUnits(lv('Gurka'))).toEqual([
      { name: 'st', grams: 350, source: 'standard' },
      { name: 'dl', grams: 50, source: 'volym' },
      { name: 'näve', grams: 30, source: 'gissning' },
      { name: 'skiva', grams: 5, source: 'standard' },
    ]);
  });

  it('en sparad måltid har bara sin portion', () => {
    const portion: FoodUnit = { name: 'portion', grams: 266, source: 'egen' };
    expect(unitsFor({ id: 'maltid:1', name: 'Frukostgröt', units: [portion] })).toEqual([portion]);
  });

  it('livsmedlets egna enheter (Open Food Facts) kommer först och vinner, gram tas bort', () => {
    const off: FoodUnit = { name: 'portion', grams: 30, source: 'openfoodfacts' };
    const units = unitsFor({ id: 'off:1', name: 'X', units: [off] }, [
      { name: 'g', grams: 1, source: 'egen' },
    ]);
    expect(units[0]).toEqual(off);
    expect(units.filter((u) => u.name === 'portion')).toHaveLength(1);
    expect(names(units)).not.toContain('g');
  });

  it('egna enheter ersätter andra med samma namn och läggs annars sist', () => {
    expect(unitsFor(egg, [st(70)])).toEqual([st(70)]);
    expect(unitsFor(egg, [{ name: 'halvt', grams: 30, source: 'egen' }])).toEqual([
      st(60, 'standard'),
      { name: 'halvt', grams: 30, source: 'egen' },
    ]);
    // En gammal egen "dl" för mjölk behålls.
    expect(
      gramsPerUnit(
        unitsFor(lv('Mjölk fett 3 %'), [{ name: 'dl', grams: 100, source: 'egen' }]),
        'dl',
      ),
    ).toBe(100);
    expect(mergeUnits([st(60, 'standard')], [{ ...st(80), name: 'ST' }])).toEqual([
      { name: 'ST', grams: 80, source: 'egen' },
    ]);
  });

  it('gäller standardtabellen bara Livsmedelsverket och kan matcha på nummer', () => {
    expect(builtInUnits({ id: 'egen:x', name: 'Ägg kokt' })).toEqual([
      { name: 'st', grams: 60, source: 'gissning' },
    ]);
    const rules = [{ label: 'test', ids: [42], units: [{ name: 'burk', grams: 400 }] }];
    expect(builtInUnits({ id: 'lv:42', name: 'Vad som helst' }, rules)).toContainEqual({
      name: 'burk',
      grams: 400,
      source: 'standard',
    });
  });

  it('standardtabellen har rimliga värden', () => {
    for (const rule of STANDARD_UNIT_RULES) {
      expect(rule.units !== undefined || rule.density !== undefined, rule.label).toBe(true);
      for (const u of rule.units ?? []) {
        expect(u.grams, `${rule.label} ${u.name}`).toBeGreaterThan(0);
        expect(u.grams, `${rule.label} ${u.name}`).toBeLessThanOrEqual(500);
      }
      if (rule.density !== undefined) {
        expect(rule.density, rule.label).toBeGreaterThan(0.1);
        expect(rule.density, rule.label).toBeLessThan(1.5);
      }
    }
  });

  it('matchar inte tillagat, torkat eller liknande namn med styckvikter', () => {
    for (const name of [
      'Banan friterad',
      'Äpple torkat',
      'Potatis råstekt',
      'Ost hårdost parmesan fett 30% typ Parmiggiano Reggiano',
      'Bröd vitt vetetortilla',
    ]) {
      expect(foodProfile(lv(name)).standard, name).toEqual([]);
    }
  });
});

describe('förval', () => {
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

  it('förifyller senast använda, annars kategorins vanligaste, annars 100 g', () => {
    const units = [st(60)];
    expect(initialUsage(units, { unit: 'st', amount: 3 })).toEqual({ unit: 'st', amount: 3 });
    expect(initialUsage(units, { unit: 'g', amount: 80 })).toEqual({ unit: 'g', amount: 80 });
    // Enheten finns inte längre.
    expect(initialUsage(units, { unit: 'skiva', amount: 2 })).toEqual({ unit: 'st', amount: 1 });
    expect(initialUsage([], null)).toEqual({ unit: 'g', amount: 100 });
    expect(initialUsage(unitsFor(lv('Mjölk fett 3 %')), null)).toEqual({ unit: 'dl', amount: 1 });
    expect(initialUsage(unitsFor(egg), null)).toEqual({ unit: 'st', amount: 1 });
    expect(initialUsage(unitsFor(lv('Läsk')), null)).toEqual({ unit: 'cl', amount: 1 });
    // Saknas värde: gissningen förvald.
    expect(initialUsage(unitsFor(lv('Bröd vitt tortilla')), null)).toEqual({
      unit: 'skiva',
      amount: 1,
    });
  });

  it('en egen enhet med känd vikt går före volym och gissningar', () => {
    const bulle = { id: 'egen:1', name: 'Mormors bulle' };
    const custom: FoodUnit[] = [{ name: 'bulle', grams: 60, source: 'egen' }];
    expect(names(unitsFor(bulle, custom))).toEqual(['st', 'bit', 'bulle']);
    expect(initialUsage(unitsFor(bulle, custom), null)).toEqual({ unit: 'bulle', amount: 1 });
  });
});

describe('gissade styckvikter', () => {
  const tortilla = lv('Bröd vitt tortilla');

  it('ger en gissning ur kategorin när standardvikt saknas', () => {
    const skiva = unitsFor(tortilla).find((u) => u.name === 'skiva');
    expect(skiva).toEqual({ name: 'skiva', grams: 30, source: 'gissning' });
    expect(isGuess(skiva)).toBe(true);
    expect(guessQuestion(skiva ?? st(0))).toBe('1 skiva ≈ 30 g, stämmer det?');
    expect(guessQuestion({ name: 'portion', grams: 250, source: 'gissning' }, 'ml')).toBe(
      '1 portion ≈ 250 ml, stämmer det?',
    );
    // En standardvikt är ingen gissning.
    expect(isGuess(unitsFor(egg)[0])).toBe(false);
  });

  it('bekräftas med ett tryck och sparas som egen enhet', () => {
    const skiva = unitsFor(tortilla).find((u) => u.name === 'skiva') ?? st(0);
    const custom = confirmGuess([], skiva);
    expect(custom).toEqual([{ name: 'skiva', grams: 30, source: 'egen' }]);
    const after = unitsFor(tortilla, custom);
    expect(after.find((u) => u.name === 'skiva')).toEqual({
      name: 'skiva',
      grams: 30,
      source: 'egen',
    });
    // Platsen behålls: skiva är fortfarande förvald och inte längre en gissning.
    expect(names(after)).toEqual(['skiva', 'st']);
    expect(after.filter(isGuess).map((u) => u.name)).toEqual(['st']);
  });

  it('kan justeras och ersätter en tidigare egen enhet med samma namn', () => {
    const skiva: FoodUnit = { name: 'skiva', grams: 30, source: 'gissning' };
    const existing: FoodUnit[] = [
      { name: 'Skiva', grams: 20, source: 'egen' },
      { name: 'halv', grams: 15, source: 'egen' },
    ];
    expect(confirmGuess(existing, skiva, 42.25)).toEqual([
      { name: 'skiva', grams: 42.3, source: 'egen' },
      { name: 'halv', grams: 15, source: 'egen' },
    ]);
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

describe('parseServing per 100 ml', () => {
  it('tolkar ml, cl, dl och l när värdena gäller per 100 ml', () => {
    expect(parseServing('250 ml', undefined, undefined, 'ml')).toBe(250);
    expect(parseServing('1 glas (2 dl)', undefined, undefined, 'ml')).toBe(200);
    expect(parseServing('33 cl', undefined, undefined, 'ml')).toBe(330);
    expect(parseServing(undefined, 250, 'ml', 'ml')).toBe(250);
    expect(parseServing('30 g', 30, 'g', 'ml')).toBeNull();
  });
});

describe('parsePackage (hela förpackningen)', () => {
  it('använder product_quantity och product_quantity_unit', () => {
    expect(parsePackage(330, 'ml', '33 cl', 'ml')).toBe(330);
    expect(parsePackage('500', 'g', undefined, 'g')).toBe(500);
    expect(parsePackage(33, 'cl', undefined, 'ml')).toBe(330);
    expect(parsePackage(1.5, 'l', undefined, 'ml')).toBe(1500);
  });

  it('tar fritexten quantity som reserv', () => {
    expect(parsePackage(undefined, undefined, '33 cl', 'ml')).toBe(330);
    expect(parsePackage(undefined, undefined, '1,5 l', 'ml')).toBe(1500);
    expect(parsePackage(undefined, undefined, '400 g', 'g')).toBe(400);
  });

  it('räknar om ml ↔ g med 1,0 g/ml när enheten inte stämmer', () => {
    expect(parsePackage(330, 'ml', undefined, 'g')).toBe(330);
    expect(parsePackage(undefined, undefined, '50 cl', 'g')).toBe(500);
  });

  it('avvisar okända enheter och orimliga värden', () => {
    expect(parsePackage(6, 'st', undefined, 'g')).toBeNull();
    expect(parsePackage(0, 'g', undefined, 'g')).toBeNull();
    expect(parsePackage(10, 'kg', undefined, 'g')).toBeNull();
    expect(parsePackage(undefined, undefined, 'en back', 'g')).toBeNull();
  });
});
