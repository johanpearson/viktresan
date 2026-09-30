import { describe, expect, it } from 'vitest';
import {
  FINELI_LICENSE,
  FINELI_SOURCE,
  fineliFile,
  fineliNumber,
  fineliRelease,
  fineliRows,
  parseFineliCsv,
} from './fineliImport.ts';
import { parseLivsmedel } from './livsmedel.ts';
import { serializeCompactFile } from './livsmedelImport.ts';

// Utdrag ur Finelis paket (samma kolumner, CRLF och decimalkomma som originalet).
const FOOD = [
  'FOODID;FOODNAME;FOODTYPE;PROCESS;EDPORT;IGCLASS;IGCLASSP;FUCLASS;FUCLASSP',
  '11049;Banaani, kuorittu;FOOD;RAW;100;FRUITOTH;FRUITTOT;FRUFRESH;FRUDITOT',
  '707;Pekoni;FOOD;SMOK;100;PORK;MEATTOT;MSTEAK;MEATDTOT',
  '900;Ei ruotsiksi;FOOD;RAW;100;;;;',
  '901;Ei energiaa;FOOD;RAW;100;;;;',
  '',
].join('\r\n');

const NAMES = [
  'FOODID;FOODNAME;LANG',
  '11049;Banan, skalad;SV',
  '707;"Bacon; fet";SV',
  '901;Utan energi;SV',
].join('\r\n');

const COMPONENTS = [
  'EUFDNAME;COMPUNIT;CMPCLASS;CMPCLASSP',
  'ENERC;KJ;ENERGY;MACROCMP',
  'PROT;G;PROTEIN;MACROCMP',
  'CHOAVL;G;TOTALCAR;MACROCMP',
  'FAT;G;TOTALFAT;MACROCMP',
  'FIBC;G;FIBRE;MACROCMP',
  'NACL;MG;MINERAL;MINERAL',
  'VITC;MG;VITAMIN;VITAMIN',
  'VITD;UG;VITAMIN;VITAMIN',
  'VITPYRID;MG;VITAMIN;VITAMIN',
  'K;MG;MINERAL;MINERAL',
].join('\r\n');

const VALUES = [
  'FOODID;EUFDNAME;BESTLOC;ACQTYPE;METHTYPE',
  '11049;ENERC;368,20;S;S',
  '11049;PROT;1,2;S;S',
  '11049;CHOAVL;18,30;S;S',
  '11049;FAT;0,4;S;S',
  '11049;FIBC;1,8;S;S',
  '11049;NACL;12,7;S;T',
  '11049;VITC;12,5;S;S',
  '11049;VITPYRID;0,5;S;S',
  '11049;K;358;S;S',
  '707;ENERC;1500;S;S',
  '707;PROT;12,1;S;S',
  '707;FAT;;S;S',
  '707;VITD;0,5;S;S',
  '901;PROT;3;S;S',
].join('\r\n');

function tables() {
  return {
    food: parseFineliCsv(FOOD),
    names: parseFineliCsv(NAMES),
    components: parseFineliCsv(COMPONENTS),
    values: parseFineliCsv(VALUES),
  };
}

describe('parseFineliCsv', () => {
  it('läser rubrikraden, CRLF, citattecken och hoppar över tomma rader', () => {
    expect(parseFineliCsv(NAMES)).toEqual([
      { FOODID: '11049', FOODNAME: 'Banan, skalad', LANG: 'SV' },
      { FOODID: '707', FOODNAME: 'Bacon; fet', LANG: 'SV' },
      { FOODID: '901', FOODNAME: 'Utan energi', LANG: 'SV' },
    ]);
    expect(parseFineliCsv('\uFEFFa;b\n1\n\n')).toEqual([{ A: '1', B: '' }]);
  });
});

describe('fineliNumber och fineliRelease', () => {
  it('tolkar decimalkomma och tomma värden', () => {
    expect(fineliNumber('1698,30')).toBe(1698.3);
    expect(fineliNumber('0')).toBe(0);
    expect(fineliNumber('')).toBeNull();
    expect(fineliNumber('x')).toBeNull();
    expect(fineliNumber(undefined)).toBeNull();
  });

  it('läser versionen ur descript.txt', () => {
    expect(fineliRelease('Fineli.\r\nVersio. Version. Release. 20.0\r\n')).toBe('20.0');
    expect(fineliRelease('ingen version')).toBeNull();
  });
});

describe('fineliRows', () => {
  it('ger svenska namn, kcal ur kJ och makron per 100 g', () => {
    const { rows } = fineliRows(tables());
    const banan = rows.find((r) => r.nummer === 11049);
    expect(banan).toMatchObject({
      namn: 'Banan, skalad',
      kcal: 88, // 368,2 kJ / 4,184
      proteinG: 1.2,
      carbsG: 18.3,
      fatG: 0.4,
      grupp: 'FRUFRESH',
    });
  });

  it('räknar om övriga näringsämnen till appens enheter', () => {
    const { rows } = fineliRows(tables());
    expect(rows.find((r) => r.nummer === 11049)?.extra).toEqual({
      fiberG: 1.8,
      saltG: 0.0127, // 12,7 mg → g
      vitaminC: 12.5,
      vitaminB6: 0.5, // VITPYRID
      potassium: 358,
    });
    expect(rows.find((r) => r.nummer === 707)?.extra).toEqual({ vitaminD: 0.5 });
  });

  it('saknat makro blir 0 och citerat namn behåller semikolon', () => {
    const bacon = fineliRows(tables()).rows.find((r) => r.nummer === 707);
    expect(bacon).toMatchObject({ namn: 'Bacon; fet', kcal: 359, fatG: 0, carbsG: 0 });
  });

  it('hoppar över livsmedel utan svenskt namn eller energi och räknar dem', () => {
    const result = fineliRows(tables());
    expect(result.rows.map((r) => r.nummer).sort((a, b) => a - b)).toEqual([707, 11049]);
    expect(result.withoutName).toBe(1);
    expect(result.withoutEnergy).toBe(1);
  });

  it('läser bara svenska namn när språket anges', () => {
    const names = parseFineliCsv('FOODID;FOODNAME;LANG\n11049;Banaani;FI');
    expect(fineliRows({ ...tables(), names }).rows).toEqual([]);
  });
});

describe('fineliFile', () => {
  it('ger samma kompakta format som Livsmedelsverkets data och kan läsas av appen', () => {
    const file = fineliFile(fineliRows(tables()).rows, '2026-09-29', '20.0');
    expect(file).toMatchObject({
      format: 'viktresan-livsmedel',
      source: FINELI_SOURCE,
      license: FINELI_LICENSE,
      retrieved: '2026-09-29',
      version: '20.0',
    });
    // Sorterad på svenska namn; kolumnerna i `extra` bara för ämnen som finns, i appens ordning.
    expect(file.foods.map((f) => f[1])).toEqual(['Bacon; fet', 'Banan, skalad']);
    expect(file.extra).toEqual([
      'fiberG',
      'saltG',
      'vitaminD',
      'vitaminB6',
      'vitaminC',
      'potassium',
    ]);

    const parsed = parseLivsmedel(JSON.parse(serializeCompactFile(file)), 'fineli');
    expect(parsed.version).toBe('20.0');
    expect(parsed.foods[1]).toEqual({
      id: 'fi:11049',
      name: 'Banan, skalad',
      source: 'fineli',
      per100: { kcal: 88, proteinG: 1.2, carbsG: 18.3, fatG: 0.4 },
      group: 'FRUFRESH',
      extra: { fiberG: 1.8, saltG: 0.0127, vitaminB6: 0.5, vitaminC: 12.5, potassium: 358 },
    });
  });
});
