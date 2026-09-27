import { describe, expect, it } from 'vitest';
import type { Supplement } from '../db/db.ts';
import {
  describeSupplement,
  formatDoseAmount,
  intakeAmounts,
  intakeFor,
  isScheduledOn,
  scheduleText,
  supplementStatus,
  supplementsOn,
  untaken,
} from './supplements.ts';

const base: Supplement = {
  id: 'd',
  name: 'D-vitamin',
  form: 'tablett',
  amountPerDose: 1,
  nutrients: [{ key: 'vitaminD', amount: 1000, unit: 'IE' }],
  schedule: 'dagligen',
  dosesPerDay: 1,
  createdAt: Date.parse('2026-01-01T08:00:00'),
};
const magnesium: Supplement = {
  ...base,
  id: 'mg',
  name: 'Magnesium',
  form: 'brustablett',
  nutrients: [
    { key: 'magnesium', amount: 300, unit: 'mg' },
    { key: 'zinc', amount: 5000, unit: 'µg' },
  ],
  schedule: 'veckodagar',
  weekdays: [0, 2], // måndag, onsdag
  dosesPerDay: 2,
};
const asNeeded: Supplement = { ...base, id: 'j', name: 'Järn', schedule: 'vid-behov' };

// 2026-09-21 är en måndag.
const MONDAY = '2026-09-21';
const TUESDAY = '2026-09-22';

describe('schema', () => {
  it('dagligen, vissa veckodagar och vid behov', () => {
    expect(isScheduledOn(base, TUESDAY)).toBe(true);
    expect(isScheduledOn(magnesium, MONDAY)).toBe(true);
    expect(isScheduledOn(magnesium, TUESDAY)).toBe(false);
    expect(isScheduledOn(asNeeded, MONDAY)).toBe(false);
  });

  it('texter', () => {
    expect(formatDoseAmount('tablett', 1)).toBe('1 tablett');
    expect(formatDoseAmount('droppe', 2)).toBe('2 droppar');
    expect(formatDoseAmount('ml', 2.5)).toBe('2,5 ml');
    expect(scheduleText(magnesium)).toBe('mån, ons · 2 gånger');
    expect(describeSupplement(base)).toBe('1 tablett · Dagligen · Vitamin D 1 000 IE');
  });
});

describe('dagens tillskott', () => {
  it('planerade först, vid behov sist; tagna markeras', () => {
    const log = [intakeFor(base, MONDAY)];
    const items = supplementsOn([asNeeded, magnesium, base], log, MONDAY);
    expect(items.map((i) => [i.supplement.id, i.planned, i.intake !== null])).toEqual([
      ['d', true, true],
      ['mg', true, false],
      ['j', false, false],
    ]);
    expect(untaken(items).map((s) => s.id)).toEqual(['mg']);
  });

  it('en tagen dos kopierar namn och värden och räknar alla doser', () => {
    const intake = intakeFor(magnesium, MONDAY, 5);
    expect(intake).toMatchObject({ id: `mg:${MONDAY}`, name: 'Magnesium', doses: 2, createdAt: 5 });
    expect(intakeAmounts(intake)).toEqual(
      new Map([
        ['magnesium', 600],
        ['zinc', 10],
      ]),
    );
    expect(intakeAmounts(intakeFor(base, MONDAY)).get('vitaminD')).toBe(25);
  });

  it('status för kalendern: tagna av planerade som fanns då', () => {
    const log = [intakeFor(base, MONDAY)];
    expect(supplementStatus([base, magnesium, asNeeded], log, MONDAY)).toEqual({
      taken: 1,
      planned: 2,
    });
    expect(supplementStatus([base], log, '2025-12-31')).toEqual({ taken: 0, planned: 0 });
  });
});
