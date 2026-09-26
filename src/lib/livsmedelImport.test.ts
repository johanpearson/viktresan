import { describe, expect, it } from 'vitest';
import { parseLivsmedel } from './livsmedel.ts';
import {
  parseFoodList,
  pickGroup,
  pickNutrients,
  serializeCompactFile,
  toCompactFile,
} from './livsmedelImport.ts';

describe('parseFoodList', () => {
  it('läser listan och totalen', () => {
    expect(
      parseFoodList({
        _meta: { totalRecords: 2569, offset: 0, limit: 2 },
        livsmedel: [
          { nummer: 1, namn: 'Nöt talg', version: '1' },
          { nummer: '2', namn: ' Havregryn ' },
          { nummer: 3, namn: '' },
          'skräp',
        ],
      }),
    ).toEqual({
      items: [
        { nummer: 1, namn: 'Nöt talg' },
        { nummer: 2, namn: 'Havregryn' },
      ],
      total: 2569,
    });
  });

  it('tar med livsmedelsgruppen om listan har den', () => {
    expect(
      parseFoodList([
        { nummer: 5, namn: 'Läsk', livsmedelsgrupp: 'Drycker' },
        { nummer: 6, namn: 'Ost', huvudgrupp: { namn: 'Ost' } },
      ]).items,
    ).toEqual([
      { nummer: 5, namn: 'Läsk', grupp: 'Drycker' },
      { nummer: 6, namn: 'Ost', grupp: 'Ost' },
    ]);
  });

  it('klarar en ren lista och okänt svar', () => {
    expect(parseFoodList([{ nummer: 5, namn: 'A' }]).items).toEqual([{ nummer: 5, namn: 'A' }]);
    expect(parseFoodList(null)).toEqual({ items: [], total: null });
  });
});

describe('pickGroup', () => {
  it('hittar gruppen i klassificeringarna', () => {
    expect(
      pickGroup([
        { typ: 'LanguaL', namn: 'A0361' },
        { typ: 'Livsmedelsgrupp', namn: 'Drycker' },
      ]),
    ).toBe('Drycker');
    expect(
      pickGroup({ klassificeringar: [{ klassificeringstyp: 'Huvudgrupp', beskrivning: 'Bröd' }] }),
    ).toBe('Bröd');
    expect(pickGroup({ nummer: 1, livsmedelsgrupp: 'Fisk' })).toBe('Fisk');
  });

  it('null utan grupp', () => {
    expect(pickGroup([{ typ: 'LanguaL', namn: 'A0361' }])).toBeNull();
    expect(pickGroup(null)).toBeNull();
    expect(pickGroup({})).toBeNull();
  });
});

describe('pickNutrients', () => {
  it('väljer kcal (inte kJ), protein, tillgängliga kolhydrater och fett', () => {
    expect(
      pickNutrients([
        { namn: 'Energi (kJ)', euroFIRkod: 'ENERC', varde: 1548, enhet: 'kJ' },
        { namn: 'Energi (kcal)', euroFIRkod: 'ENERC', varde: 370.2, enhet: 'kcal' },
        { namn: 'Protein', euroFIRkod: 'PROT', varde: 13.04, enhet: 'g' },
        { namn: 'Kolhydrater, tillgängliga', euroFIRkod: 'CHO', varde: '58,7', enhet: 'g' },
        { namn: 'Fett, totalt', euroFIRkod: 'FAT', varde: 7, enhet: 'g' },
        { namn: 'Fibrer', euroFIRkod: 'FIBT', varde: 10, enhet: 'g' },
      ]),
    ).toEqual({ kcal: 370, proteinG: 13, carbsG: 58.7, fatG: 7 });
  });

  it('faller tillbaka på namnen och sätter saknade makron till 0', () => {
    expect(
      pickNutrients({
        naringsvarden: [
          { namn: 'Energi (kcal)', varde: 52, enhet: 'kcal' },
          { namn: 'Fett, totalt', varde: 0.2, enhet: 'g' },
        ],
      }),
    ).toEqual({ kcal: 52, proteinG: 0, carbsG: 0, fatG: 0.2 });
  });

  it('null utan energi', () => {
    expect(pickNutrients([{ namn: 'Protein', euroFIRkod: 'PROT', varde: 3 }])).toBeNull();
    expect(pickNutrients('nej')).toBeNull();
  });
});

describe('toCompactFile', () => {
  it('sorterar på svenska och går att läsa tillbaka i appen', () => {
    const file = toCompactFile(
      [
        { nummer: 2, namn: 'Äpple', kcal: 52, proteinG: 0.3, carbsG: 11, fatG: 0.2 },
        { nummer: 1, namn: 'Banan', kcal: 95, proteinG: 1.1, carbsG: 21, fatG: 0.3 },
        { nummer: 3, namn: 'Ost', kcal: 350, proteinG: 27, carbsG: 0, fatG: 27 },
      ],
      '2026-09-25',
    );
    expect(file.foods.map((f) => f[1])).toEqual(['Banan', 'Ost', 'Äpple']);
    const text = serializeCompactFile(file);
    expect(text.split('\n')).toHaveLength(6);
    const parsed = parseLivsmedel(JSON.parse(text));
    expect(parsed.retrieved).toBe('2026-09-25');
    expect(parsed.license).toBe('CC BY 4.0');
    expect(parsed.foods.map((f) => f.id)).toEqual(['lv:1', 'lv:3', 'lv:2']);
  });

  it('skriver gruppen som sjunde kolumn när den finns', () => {
    const file = toCompactFile(
      [
        { nummer: 1, namn: 'Läsk', kcal: 36, proteinG: 0, carbsG: 8.8, fatG: 0, grupp: 'Drycker' },
        { nummer: 2, namn: 'Banan', kcal: 95, proteinG: 1.1, carbsG: 21, fatG: 0.3 },
      ],
      '2026-09-25',
    );
    expect(file.foods).toEqual([
      [2, 'Banan', 95, 1.1, 21, 0.3],
      [1, 'Läsk', 36, 0, 8.8, 0, 'Drycker'],
    ]);
    const parsed = parseLivsmedel(JSON.parse(serializeCompactFile(file)));
    expect(parsed.foods[1]?.group).toBe('Drycker');
  });
});
