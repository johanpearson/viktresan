import { describe, expect, it } from 'vitest';
import { LIVSMEDEL_FORMAT, parseLivsmedel } from './livsmedel.ts';

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
});
