import { describe, expect, it } from 'vitest';
import {
  decimalInput,
  formatCm,
  formatGrams,
  formatKcal,
  formatRate,
  formatDate,
  formatPhotoLabel,
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

  it('formaterar cm med högst en decimal', () => {
    expect(formatCm(92.5)).toBe('92,5 cm');
    expect(formatCm(90)).toBe('90 cm');
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

describe('formatPhotoLabel', () => {
  it('visar datum och vikt när vikten finns', () => {
    expect(formatPhotoLabel({ date: '2026-09-25', weightKg: 84.24 })).toMatch(
      /^25 sep.* 2026 · 84,2 kg$/,
    );
  });

  it('visar bara datum utan vikt', () => {
    expect(formatPhotoLabel({ date: '2026-09-25' })).toMatch(/^25 sep.* 2026$/);
  });
});

describe('mat', () => {
  it('formaterar kcal, gram och takt', () => {
    expect(formatKcal(1234.4)).toBe('1 234 kcal');
    expect(formatKcal(-0.4)).toBe('0 kcal');
    expect(formatGrams(7.84)).toBe('7,8 g');
    expect(formatGrams(60)).toBe('60 g');
    expect(formatRate(0.25)).toBe('0,25 kg/vecka');
    expect(formatRate(0.7)).toBe('0,7 kg/vecka');
    expect(formatRate(0.20618)).toBe('0,21 kg/vecka');
    expect(decimalInput(1.5)).toBe('1,5');
    expect(decimalInput(60)).toBe('60');
  });
});
