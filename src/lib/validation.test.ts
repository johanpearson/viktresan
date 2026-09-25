import { describe, expect, it } from 'vitest';
import {
  parseFoodFields,
  parseLogAmount,
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
      value: {
        startDate: '2026-01-01',
        startWeightKg: 90.5,
        heightCm: 180,
        goalWeightKg: 80,
        ratePerWeekKg: 0.5,
      },
    });
  });

  it('tar med kön, födelseår, aktivitetsnivå och takt', () => {
    const result = parseProfile({
      ...profile,
      sex: 'kvinna',
      birthYear: ' 1985 ',
      activityLevel: 'mattlig',
      rate: '0.75',
    });
    expect(result).toMatchObject({
      ok: true,
      value: { sex: 'kvinna', birthYear: 1985, activityLevel: 'mattlig', ratePerWeekKg: 0.75 },
    });
  });

  it('underkänner orimligt födelseår och okänd takt', () => {
    expect(parseProfile({ ...profile, birthYear: '85' })).toMatchObject({ ok: false });
    expect(parseProfile({ ...profile, birthYear: '2020' })).toMatchObject({ ok: false });
    expect(parseProfile({ ...profile, birthYear: '1900' })).toMatchObject({ ok: false });
    expect(parseProfile({ ...profile, rate: '2' })).toEqual({
      ok: false,
      error: 'Välj en takt mellan 0,25 och 1 kg/vecka.',
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

describe('parseFoodFields', () => {
  const food = {
    name: ' Mormors gröt ',
    kcal: '90',
    protein: '3',
    carbs: '15,5',
    fat: '',
    portionName: '',
    portionG: '',
    ean: '',
  };

  it('godkänner ett livsmedel; tomma makron blir 0', () => {
    expect(parseFoodFields(food)).toEqual({
      ok: true,
      value: { name: 'Mormors gröt', per100: { kcal: 90, proteinG: 3, carbsG: 15.5, fatG: 0 } },
    });
  });

  it('tar med portion och streckkod', () => {
    expect(
      parseFoodFields({ ...food, portionG: '250', portionName: 'tallrik', ean: '4006381333931' }),
    ).toMatchObject({
      ok: true,
      value: { portionG: 250, portionName: 'tallrik', ean: '4006381333931' },
    });
    expect(parseFoodFields({ ...food, portionG: '250' })).toMatchObject({
      value: { portionName: 'portion' },
    });
  });

  it('underkänner orimliga värden', () => {
    expect(parseFoodFields({ ...food, name: ' ' })).toMatchObject({ ok: false });
    expect(parseFoodFields({ ...food, kcal: '' })).toMatchObject({ ok: false });
    expect(parseFoodFields({ ...food, kcal: '1000' })).toMatchObject({ ok: false });
    expect(parseFoodFields({ ...food, protein: '-1' })).toMatchObject({ ok: false });
    expect(parseFoodFields({ ...food, protein: '50', carbs: '40', fat: '20' })).toMatchObject({
      ok: false,
    });
    expect(parseFoodFields({ ...food, portionG: '0' })).toMatchObject({ ok: false });
    expect(parseFoodFields({ ...food, ean: '123' })).toMatchObject({ ok: false });
  });
});

describe('parseLogAmount', () => {
  it('gram', () => {
    expect(parseLogAmount('60', 'g')).toEqual({ ok: true, value: { grams: 60 } });
    expect(parseLogAmount('0', 'g')).toMatchObject({ ok: false });
    expect(parseLogAmount('abc', 'g')).toMatchObject({ ok: false });
  });

  it('portioner räknas om till gram', () => {
    expect(parseLogAmount('1,5', 'portion', 40)).toEqual({
      ok: true,
      value: { grams: 60, portionCount: 1.5 },
    });
    expect(parseLogAmount('1', 'portion')).toMatchObject({ ok: false });
    expect(parseLogAmount('0', 'portion', 40)).toMatchObject({ ok: false });
  });
});
