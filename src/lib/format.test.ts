import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatInt,
  formatShortDate,
  formatKg,
  parseDecimal,
  stepKg,
} from './format.ts';

describe('format', () => {
  it('formaterar kg med en decimal och decimalkomma', () => {
    expect(formatKg(81.46)).toBe('81,5 kg');
    expect(formatKg(80)).toBe('80,0 kg');
  });

  it('visar tecken när det efterfrågas och aldrig "−0,0"', () => {
    expect(formatKg(1.25, { signed: true })).toBe('+1,3 kg');
    expect(formatKg(-2.4, { signed: true })).toMatch(/^[−-]2,4 kg$/);
    expect(formatKg(-0.01, { signed: true })).toBe('0,0 kg');
  });

  it('formaterar heltal med mellanslag som tusentalsavgränsare', () => {
    expect(formatInt(12345)).toBe('12 345');
  });

  it('formaterar datum på svenska', () => {
    expect(formatDate('2026-09-25')).toMatch(/25 sep.* 2026/);
    expect(formatShortDate('2026-09-25')).toMatch(/^25 sep\.?$/);
  });

  it('tolkar decimaltal med komma eller punkt', () => {
    expect(parseDecimal('81,5')).toBe(81.5);
    expect(parseDecimal(' 81.5 ')).toBe(81.5);
    expect(parseDecimal('82')).toBe(82);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('8,1,5')).toBeNull();
  });

  it('stegar vikt med 0,1 utan flyttalsbrus', () => {
    expect(stepKg(80.1, 0.1)).toBe(80.2);
    expect(stepKg(80.3, -0.1)).toBe(80.2);
    expect(stepKg(0.2, 0.1)).toBe(0.3);
  });
});
