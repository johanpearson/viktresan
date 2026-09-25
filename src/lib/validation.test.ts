import { describe, expect, it } from 'vitest';
import {
  parsePhotoFields,
  parseProfile,
  parseStepsFields,
  parseWaistFields,
  parseWeightFields,
} from './validation.ts';

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

describe('parseWeightFields', () => {
  const base = { date: '2026-01-01', weight: '81,5', note: '' };

  it('godkänner vikt utan anteckning', () => {
    expect(parseWeightFields(base)).toEqual({
      ok: true,
      value: { date: '2026-01-01', weightKg: 81.5 },
    });
  });

  it('tar med anteckningen', () => {
    expect(parseWeightFields({ ...base, note: '  Efter semester ' })).toEqual({
      ok: true,
      value: { date: '2026-01-01', weightKg: 81.5, note: 'Efter semester' },
    });
  });

  it('underkänner ogiltiga värden', () => {
    expect(parseWeightFields({ ...base, weight: '' })).toMatchObject({ ok: false });
    expect(parseWeightFields({ ...base, weight: '5' })).toMatchObject({ ok: false });
    expect(parseWeightFields({ ...base, date: '2026-02-30' })).toMatchObject({ ok: false });
  });
});

describe('parseWaistFields', () => {
  it('godkänner decimaler med komma', () => {
    expect(parseWaistFields({ date: '2026-01-01', waist: '92,5' })).toEqual({
      ok: true,
      value: { date: '2026-01-01', waistCm: 92.5 },
    });
  });

  it('underkänner ogiltiga värden', () => {
    expect(parseWaistFields({ date: '2026-01-01', waist: '' })).toMatchObject({ ok: false });
    expect(parseWaistFields({ date: '2026-01-01', waist: '5' })).toMatchObject({ ok: false });
    expect(parseWaistFields({ date: 'igår', waist: '90' })).toMatchObject({ ok: false });
  });
});

describe('parseStepsFields', () => {
  it('godkänner heltal med mellanslag och noll', () => {
    expect(parseStepsFields({ date: '2026-01-01', steps: '10 500' })).toEqual({
      ok: true,
      value: { date: '2026-01-01', steps: 10500 },
    });
    expect(parseStepsFields({ date: '2026-01-01', steps: '0' })).toMatchObject({ ok: true });
  });

  it('underkänner ogiltiga värden', () => {
    for (const steps of ['', ' ', '1,5', '-3', '300000', 'många']) {
      expect(parseStepsFields({ date: '2026-01-01', steps }), steps).toMatchObject({ ok: false });
    }
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
