import { describe, expect, it } from 'vitest';
import { LIVSMEDEL_FORMAT, mergeDatabases, parseLivsmedel } from './livsmedel.ts';

describe('parseLivsmedel', () => {
  it('tolkar den kompakta filen', () => {
    const result = parseLivsmedel({
      format: LIVSMEDEL_FORMAT,
      source: 'Livsmedelsverkets livsmedelsdatabas',
      license: 'CC BY 4.0',
      retrieved: '2026-09-01',
      foods: [[1, 'Havregryn', 370, 13, 59, 7]],
    });
    expect(result).toEqual({
      source: 'Livsmedelsverkets livsmedelsdatabas',
      license: 'CC BY 4.0',
      retrieved: '2026-09-01',
      foods: [
        {
          id: 'lv:1',
          name: 'Havregryn',
          source: 'livsmedelsverket',
          per100: { kcal: 370, proteinG: 13, carbsG: 59, fatG: 7 },
        },
      ],
    });
  });

  it('läser livsmedelsgruppen när den finns', () => {
    const result = parseLivsmedel({
      format: LIVSMEDEL_FORMAT,
      foods: [
        [1, 'Läsk', 36, 0, 8.8, 0, ' Drycker '],
        [2, 'Havregryn', 370, 13, 59, 7, ''],
        [3, 'Banan', 95, 1.1, 21, 0.3, 42],
      ],
    });
    expect(result.foods.map((f) => f.group)).toEqual(['Drycker', undefined, undefined]);
  });

  it('läser övriga näringsämnen i ordningen i `extra`', () => {
    const result = parseLivsmedel({
      format: LIVSMEDEL_FORMAT,
      extra: ['fiberG', 'okänt', 'vitaminC'],
      foods: [
        [1, 'Apelsin', 50, 0.8, 10.4, 0.2, '', [2.1, 9, 51]],
        [2, 'Läsk', 36, 0, 8.8, 0, 'Drycker', [null, 1, -3]],
        [3, 'Havregryn', 370, 13, 59, 7],
      ],
    });
    expect(result.foods.map((f) => f.extra)).toEqual([
      { fiberG: 2.1, vitaminC: 51 },
      undefined,
      undefined,
    ]);
    expect(result.foods[1]?.group).toBe('Drycker');
  });

  it('hoppar över ogiltiga rader', () => {
    const result = parseLivsmedel({
      format: LIVSMEDEL_FORMAT,
      foods: [
        [1, 'Ok', 1, 2, 3, 4],
        [2, '', 1, 2, 3, 4],
        [3, 'Negativ', -1, 2, 3, 4],
        [4.5, 'Decimalnummer', 1, 2, 3, 4],
        [5, 'Kort', 1],
        'nej',
      ],
    });
    expect(result.foods.map((f) => f.name)).toEqual(['Ok']);
    expect(result.retrieved).toBeNull();
  });

  it('fel format ger en tom databas', () => {
    expect(parseLivsmedel({ format: 'annat', foods: [[1, 'x', 1, 1, 1, 1]] }).foods).toEqual([]);
    expect(parseLivsmedel(null).foods).toEqual([]);
  });

  it('Finelis fil får id:n fi:<nummer>, källan fineli och versionen', () => {
    const result = parseLivsmedel(
      {
        format: LIVSMEDEL_FORMAT,
        source: 'Fineli',
        license: 'CC BY 4.0',
        retrieved: '2026-09-29',
        version: '20.0',
        foods: [[11049, 'Banan, skalad', 88, 1.2, 18.3, 0.4, 'FRUFRESH']],
      },
      'fineli',
    );
    expect(result.version).toBe('20.0');
    expect(result.foods).toEqual([
      {
        id: 'fi:11049',
        name: 'Banan, skalad',
        source: 'fineli',
        per100: { kcal: 88, proteinG: 1.2, carbsG: 18.3, fatG: 0.4 },
        group: 'FRUFRESH',
      },
    ]);
  });
});

describe('mergeDatabases', () => {
  const lv = parseLivsmedel({
    format: LIVSMEDEL_FORMAT,
    source: 'Livsmedelsverkets livsmedelsdatabas',
    license: 'CC BY 4.0',
    retrieved: '2026-09-27',
    foods: [[1, 'Banan', 95, 1.1, 21, 0.3]],
  });
  const fi = parseLivsmedel(
    {
      format: LIVSMEDEL_FORMAT,
      source: 'Fineli',
      license: 'CC BY 4.0',
      retrieved: '2026-09-29',
      version: '20.0',
      foods: [[1, 'Banan, skalad', 88, 1.2, 18.3, 0.4]],
    },
    'fineli',
  );

  it('slår ihop livsmedlen (Livsmedelsverket först) och listar källorna', () => {
    const merged = mergeDatabases([
      { key: 'livsmedelsverket', data: lv },
      { key: 'fineli', data: fi },
    ]);
    expect(merged.foods.map((f) => f.id)).toEqual(['lv:1', 'fi:1']);
    expect(merged.source).toBe('Livsmedelsverkets livsmedelsdatabas');
    expect(merged.databases).toEqual([
      {
        key: 'livsmedelsverket',
        source: 'Livsmedelsverkets livsmedelsdatabas',
        license: 'CC BY 4.0',
        retrieved: '2026-09-27',
        count: 1,
      },
      {
        key: 'fineli',
        source: 'Fineli',
        license: 'CC BY 4.0',
        retrieved: '2026-09-29',
        version: '20.0',
        count: 1,
      },
    ]);
  });

  it('utelämnar en databas som saknas', () => {
    const merged = mergeDatabases([
      { key: 'livsmedelsverket', data: parseLivsmedel(null) },
      { key: 'fineli', data: fi },
    ]);
    expect(merged.foods.map((f) => f.id)).toEqual(['fi:1']);
    expect(merged.source).toBe('Fineli');
    expect(merged.databases?.map((d) => d.key)).toEqual(['fineli']);
    expect(mergeDatabases([]).foods).toEqual([]);
  });
});
