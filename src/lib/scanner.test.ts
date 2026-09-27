import { describe, expect, it } from 'vitest';
import {
  DARK_LUMA,
  INITIAL_LIGHT,
  LIGHT_LUMA,
  averageLuma,
  cameraFeatures,
  nextLight,
  pointOfInterest,
} from './scanner.ts';

function pixels(r: number, g: number, b: number, count = 16): number[] {
  return Array.from({ length: count }, () => [r, g, b, 255]).flat();
}

describe('ljusnivå', () => {
  it('räknar luma (Rec. 601) på RGBA-data', () => {
    expect(averageLuma(pixels(0, 0, 0))).toBe(0);
    expect(averageLuma(pixels(255, 255, 255))).toBeCloseTo(255);
    expect(averageLuma(pixels(255, 0, 0), 1)).toBeCloseTo(76.245);
    expect(averageLuma([])).toBe(0);
  });

  it('mörkt först efter två mörka mätningar i rad', () => {
    let state = nextLight(INITIAL_LIGHT, 10);
    expect(state.dark).toBe(false);
    state = nextLight(state, 10);
    expect(state.dark).toBe(true);
  });

  it('en ljus mätning emellan nollställer räkningen', () => {
    let state = nextLight(INITIAL_LIGHT, 10);
    state = nextLight(state, 200);
    state = nextLight(state, 10);
    expect(state.dark).toBe(false);
  });

  it('hysteres: mörkt tills ljuset är klart över gränsen', () => {
    let state = nextLight(nextLight(INITIAL_LIGHT, 5), 5);
    expect(state.dark).toBe(true);
    state = nextLight(state, (DARK_LUMA + LIGHT_LUMA) / 2);
    expect(state.dark).toBe(true);
    state = nextLight(state, LIGHT_LUMA + 1);
    expect(state.dark).toBe(false);
  });
});

describe('cameraFeatures', () => {
  it('ficklampa, zoom och fokus när kameran har dem', () => {
    expect(
      cameraFeatures({
        torch: true,
        zoom: { min: 1, max: 8, step: 0.5 },
        focusMode: ['continuous', 'single-shot'],
      }),
    ).toEqual({ torch: true, zoom: { min: 1, max: 8, step: 0.5 }, focus: true });
  });

  it('inget av det utan kapaciteter (knapparna döljs)', () => {
    expect(cameraFeatures({})).toEqual({ torch: false, zoom: null, focus: false });
    expect(cameraFeatures(null)).toEqual({ torch: false, zoom: null, focus: false });
    expect(cameraFeatures({ torch: false, zoom: { min: 1, max: 1 } }).zoom).toBeNull();
  });

  it('fokuspunkt som andel av videon, inom 0–1', () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 };
    expect(pointOfInterest(110, 70, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(pointOfInterest(0, 500, rect)).toEqual({ x: 0, y: 1 });
  });
});
