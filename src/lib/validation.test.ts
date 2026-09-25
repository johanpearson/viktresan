import { describe, expect, it } from 'vitest';
import { parseMeasurement, parsePhotoFields, parseProfile } from './validation.ts';

const profile = {
  startDate: '2026-01-01',
  startWeight: '90,5',
  height: '180',
  goalWeight: '80',
  goalDate: '',
};

describe('parseProfile', () => {
  it('godkänner en giltig profil utan måldatum', () => {
    expect(parseProfile(profile)).toEqual({
      ok: true,
      value: { startDate: '2026-01-01', startWeightKg: 90.5, heightCm: 180, goalWeightKg: 80 },
    });
  });

  it('tar med måldatum när det finns', () => {
    const result = parseProfile({ ...profile, goalDate: '2026-12-31' });
    expect(result.ok && result.value.goalDate).toBe('2026-12-31');
  });

  it('underkänner orimliga värden', () => {
    expect(parseProfile({ ...profile, startWeight: '' })).toMatchObject({ ok: false });
    expect(parseProfile({ ...profile, height: '18' })).toMatchObject({ ok: false });
    expect(parseProfile({ ...profile, goalWeight: 'åttio' })).toMatchObject({ ok: false });
    expect(parseProfile({ ...profile, startDate: '' })).toMatchObject({ ok: false });
  });

  it('kräver att måldatum ligger efter startdatum', () => {
    expect(parseProfile({ ...profile, goalDate: '2026-01-01' })).toEqual({
      ok: false,
      error: 'Måldatum måste ligga efter startdatum.',
    });
  });
});

describe('parseMeasurement', () => {
  const base = { date: '2026-01-01', weight: '81,5', waist: '', steps: '', note: '' };

  it('godkänner bara vikt', () => {
    expect(parseMeasurement(base)).toEqual({
      ok: true,
      value: { date: '2026-01-01', weightKg: 81.5 },
    });
  });

  it('tar med valfria fält', () => {
    expect(
      parseMeasurement({ ...base, waist: '92,5', steps: '10 500', note: '  Efter semester ' }),
    ).toEqual({
      ok: true,
      value: {
        date: '2026-01-01',
        weightKg: 81.5,
        waistCm: 92.5,
        steps: 10500,
        note: 'Efter semester',
      },
    });
  });

  it('underkänner ogiltiga värden', () => {
    expect(parseMeasurement({ ...base, weight: '' })).toMatchObject({ ok: false });
    expect(parseMeasurement({ ...base, steps: '1,5' })).toMatchObject({ ok: false });
    expect(parseMeasurement({ ...base, steps: '-3' })).toMatchObject({ ok: false });
    expect(parseMeasurement({ ...base, waist: '5' })).toMatchObject({ ok: false });
    expect(parseMeasurement({ ...base, date: '2026-02-30' })).toMatchObject({ ok: false });
  });
});

describe('parsePhotoFields', () => {
  it('godtar datum utan vikt', () => {
    expect(parsePhotoFields({ date: '2026-09-25', weight: ' ' })).toEqual({
      ok: true,
      value: { date: '2026-09-25' },
    });
  });

  it('tolkar vikt med decimalkomma', () => {
    expect(parsePhotoFields({ date: '2026-09-25', weight: '84,2' })).toEqual({
      ok: true,
      value: { date: '2026-09-25', weightKg: 84.2 },
    });
  });

  it('avvisar ogiltigt datum och orimlig vikt', () => {
    expect(parsePhotoFields({ date: '', weight: '' }).ok).toBe(false);
    expect(parsePhotoFields({ date: '2026-09-25', weight: '5' }).ok).toBe(false);
    expect(parsePhotoFields({ date: '2026-09-25', weight: 'abc' }).ok).toBe(false);
  });
});
