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
