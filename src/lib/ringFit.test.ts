import { describe, expect, it } from 'vitest';
import {
  innerRadius,
  lineSizePx,
  linesFit,
  ringTextScale,
  rowTextScale,
  type RingLine,
} from './ringFit.ts';

// Ungefärliga mått: "2 950" i fetstil och "av 3 100" (bredd per px teckenstorlek).
const value: RingLine = { widthPerPx: 3.1, heightPerPx: 1, basePx: 16, minPx: 13.75 };
const goal: RingLine = { widthPerPx: 4.4, heightPerPx: 1, basePx: 13, minPx: 11 };

describe('ringFit', () => {
  it('räknar ut ringens inre radie ur diametern', () => {
    // Radie 42 och linje 8 i en viewBox på 96: insidan ligger på 38.
    expect(innerRadius(96)).toBeCloseTo(38);
    expect(innerRadius(48)).toBeCloseTo(19);
  });

  it('krymper inte text som redan ryms', () => {
    expect(ringTextScale([value, goal], 96)).toBe(1);
  });

  it('krymper texten tills den ryms inom den inre cirkeln med marginal', () => {
    const scale = ringTextScale([value, goal], 76);
    expect(scale).toBeLessThan(1);
    const sizes = [value, goal].map((l) => lineSizePx(l, scale));
    expect(linesFit([value, goal], sizes, innerRadius(76) - 2)).toBe(true);
    // Lite större text ryms inte.
    const bigger = [value, goal].map((l) => lineSizePx(l, scale * 1.02));
    expect(linesFit([value, goal], bigger, innerRadius(76) - 2)).toBe(false);
  });

  it('går aldrig under min-storleken', () => {
    const scale = ringTextScale([value, goal], 40);
    expect(lineSizePx(value, scale)).toBeCloseTo(13.75);
    expect(lineSizePx(goal, scale)).toBeCloseTo(11);
    expect(lineSizePx(goal, 0.1)).toBe(11);
  });

  it('räknar varje rad för sig: en smal rad nära kanten ryms där en bred inte gör det', () => {
    const narrow: RingLine = { widthPerPx: 1, heightPerPx: 1, basePx: 10, minPx: 10 };
    const wide: RingLine = { widthPerPx: 3, heightPerPx: 1, basePx: 10, minPx: 10 };
    // Två rader à 10 px: ytterkanten 10 px från mitten. Bred rad: halva bredden 15 → √(15² + 10²) ≈ 18.
    expect(linesFit([narrow, narrow], [10, 10], 12)).toBe(true);
    expect(linesFit([wide, narrow], [10, 10], 17)).toBe(false);
    expect(linesFit([wide, narrow], [10, 10], 18.1)).toBe(true);
  });

  it('ger skala 1 utan mätbar text (t.ex. jsdom)', () => {
    expect(ringTextScale([{ widthPerPx: 0, heightPerPx: 0, basePx: 0, minPx: 11 }], 96)).toBe(1);
    expect(ringTextScale([value], 0)).toBe(1);
  });

  it('ger samma skala i hela raden, styrd av den ring som behöver krympa mest', () => {
    expect(rowTextScale([1, 0.8, 0.9])).toBe(0.8);
    expect(rowTextScale([])).toBe(1);
  });
});
