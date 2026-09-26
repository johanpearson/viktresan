import { describe, expect, it } from 'vitest';
import type { Injection, Medication } from '../db/db.ts';
import {
  INJECTION_SITES,
  describeSchedule,
  doseChanges,
  doseOn,
  doseStepOn,
  dosesBetween,
  dueToday,
  isCovered,
  nextDose,
  nextDoseStep,
  scheduleDates,
  suggestSite,
  suggestedDose,
  type InjectionSite,
} from './glp1.ts';

/** Onsdag 2026-09-16 kl. 10:00 lokal tid. */
const NOW = new Date(2026, 8, 16, 10, 0);

/** Wegovy varje måndag 08:00 med en trappa i fyraveckorssteg. */
const wegovy: Medication = {
  id: 'wegovy',
  name: 'Wegovy',
  frequency: 'vecka',
  weekday: 0,
  time: '08:00',
  steps: [
    { date: '2026-08-31', doseMg: 0.25 },
    { date: '2026-09-28', doseMg: 0.5 },
    { date: '2026-10-26', doseMg: 1 },
  ],
  createdAt: 1,
};

const saxenda: Medication = {
  id: 'saxenda',
  name: 'Saxenda',
  frequency: 'dag',
  time: '21:00',
  steps: [
    { date: '2026-09-14', doseMg: 0.6 },
    { date: '2026-09-21', doseMg: 1.2 },
  ],
  endDate: '2026-09-25',
  createdAt: 2,
};

let seq = 0;
function injection(date: string, extra: Partial<Injection> = {}): Injection {
  seq += 1;
  return {
    id: `i${String(seq)}`,
    date,
    medicationId: 'wegovy',
    medicationName: 'Wegovy',
    doseMg: 0.25,
    createdAt: seq,
    ...extra,
  };
}

describe('dostrappa', () => {
  it('dosen gäller från stegets datum tills nästa steg', () => {
    expect(doseOn(wegovy, '2026-08-30')).toBeNull();
    expect(doseOn(wegovy, '2026-08-31')).toBe(0.25);
    expect(doseOn(wegovy, '2026-09-27')).toBe(0.25);
    expect(doseOn(wegovy, '2026-09-28')).toBe(0.5);
    expect(doseOn(wegovy, '2027-06-01')).toBe(1);
  });

  it('hittar rätt steg även om stegen inte är sorterade', () => {
    const steps = [
      { date: '2026-10-01', doseMg: 1 },
      { date: '2026-09-01', doseMg: 0.5 },
    ];
    expect(doseStepOn(steps, '2026-09-15')).toEqual({ date: '2026-09-01', doseMg: 0.5 });
    expect(doseStepOn(steps, '2026-10-15')).toEqual({ date: '2026-10-01', doseMg: 1 });
  });

  it('nästa steg efter ett datum', () => {
    expect(nextDoseStep(wegovy, '2026-09-21')).toEqual({ date: '2026-09-28', doseMg: 0.5 });
    expect(nextDoseStep(wegovy, '2026-10-26')).toBeNull();
  });

  it('förifylld dos: trappan först, annars senast loggade dosen', () => {
    expect(suggestedDose(wegovy, [], '2026-09-28')).toBe(0.5);
    const before = { ...wegovy, steps: [{ date: '2026-10-01', doseMg: 1 }] };
    expect(suggestedDose(before, [], '2026-09-16')).toBeNull();
    expect(suggestedDose(before, [injection('2026-09-07', { doseMg: 0.5 })], '2026-09-16')).toBe(
      0.5,
    );
  });

  it('dosbyten: start och varje ändring av dos eller läkemedel', () => {
    const changes = doseChanges([
      injection('2026-09-14', { doseMg: 0.25 }),
      injection('2026-08-31', { doseMg: 0.25 }),
      injection('2026-09-07', { doseMg: 0.25 }),
      injection('2026-09-28', { doseMg: 0.5 }),
      injection('2026-10-05', { doseMg: 0.5 }),
      injection('2026-10-12', { doseMg: 0.5, medicationId: 'm', medicationName: 'Mounjaro' }),
    ]);
    expect(changes).toEqual([
      { date: '2026-08-31', medicationName: 'Wegovy', doseMg: 0.25, kind: 'start' },
      { date: '2026-09-28', medicationName: 'Wegovy', doseMg: 0.5, kind: 'byte' },
      { date: '2026-10-12', medicationName: 'Mounjaro', doseMg: 0.5, kind: 'byte' },
    ]);
    expect(doseChanges([])).toEqual([]);
  });
});

describe('schema', () => {
  it('veckovis: bara vald veckodag, från första steget', () => {
    expect(scheduleDates(wegovy, '2026-08-24', '2026-09-20')).toEqual([
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
    ]);
  });

  it('veckovis: första dosen är första valda veckodagen på eller efter start', () => {
    const thursdayStart = { ...wegovy, steps: [{ date: '2026-09-03', doseMg: 0.25 }] };
    expect(scheduleDates(thursdayStart, '2026-09-01', '2026-09-15')).toEqual([
      '2026-09-07',
      '2026-09-14',
    ]);
  });

  it('dagligen: varje dag t.o.m. slutdatum', () => {
    expect(scheduleDates(saxenda, '2026-09-22', '2026-09-30')).toEqual([
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
  });

  it('beskriver schemat', () => {
    expect(describeSchedule(wegovy)).toBe('Varje måndag 08:00');
    expect(describeSchedule(saxenda)).toBe('Varje dag 21:00');
  });

  it('veckodos räknas som tagen inom ±3 dagar, dagsdos bara samma dag', () => {
    expect(isCovered(wegovy, '2026-09-14', [injection('2026-09-11')])).toBe(true);
    expect(isCovered(wegovy, '2026-09-14', [injection('2026-09-17')])).toBe(true);
    expect(isCovered(wegovy, '2026-09-14', [injection('2026-09-10')])).toBe(false);
    expect(isCovered(wegovy, '2026-09-14', [injection('2026-09-18')])).toBe(false);
    // Annat läkemedel räknas inte.
    expect(isCovered(wegovy, '2026-09-14', [injection('2026-09-14', { medicationId: 'x' })])).toBe(
      false,
    );
    const dose = injection('2026-09-22', { medicationId: 'saxenda' });
    expect(isCovered(saxenda, '2026-09-22', [dose])).toBe(true);
    expect(isCovered(saxenda, '2026-09-23', [dose])).toBe(false);
  });

  it('nästa dos: första schemadagen från idag som inte tagits, med dos ur trappan', () => {
    expect(nextDose([wegovy], [], NOW)).toMatchObject({
      date: '2026-09-21',
      time: '08:00',
      doseMg: 0.25,
      status: 'planerad',
    });
    // Tagen tidigt (fredag) → måndagens dos är klar, nästa är steget upp till 0,5 mg.
    expect(nextDose([wegovy], [injection('2026-09-18')], NOW)).toMatchObject({
      date: '2026-09-28',
      doseMg: 0.5,
    });
    expect(nextDose([], [], NOW)).toBeNull();
    // Avslutat läkemedel har ingen nästa dos.
    expect(nextDose([{ ...wegovy, endDate: '2026-09-15' }], [], NOW)).toBeNull();
  });

  it('dosdag: påminner tills dosen är loggad', () => {
    const monday = new Date(2026, 8, 21, 7, 0);
    expect(dueToday([wegovy], [], monday).map((d) => d.date)).toEqual(['2026-09-21']);
    expect(dueToday([wegovy], [injection('2026-09-21')], monday)).toEqual([]);
    expect(dueToday([wegovy], [], NOW)).toEqual([]);
  });

  it('kalendern: loggade doser och planerade från idag, i tidsordning', () => {
    const logged = injection('2026-09-14', { time: '08:05' });
    const doses = dosesBetween(
      [wegovy, saxenda],
      [logged],
      '2026-09-14',
      '2026-09-22',
      '2026-09-16',
    );
    expect(doses.map((d) => [d.date, d.medicationName, d.doseMg, d.status])).toEqual([
      ['2026-09-14', 'Wegovy', 0.25, 'loggad'],
      ['2026-09-16', 'Saxenda', 0.6, 'planerad'],
      ['2026-09-17', 'Saxenda', 0.6, 'planerad'],
      ['2026-09-18', 'Saxenda', 0.6, 'planerad'],
      ['2026-09-19', 'Saxenda', 0.6, 'planerad'],
      ['2026-09-20', 'Saxenda', 0.6, 'planerad'],
      ['2026-09-21', 'Wegovy', 0.25, 'planerad'],
      ['2026-09-21', 'Saxenda', 1.2, 'planerad'],
      ['2026-09-22', 'Saxenda', 1.2, 'planerad'],
    ]);
    expect(doses[0]?.injection).toBe(logged);
  });
});

describe('rotation av injektionsställe', () => {
  const order = INJECTION_SITES.map((s) => s.id);

  it('börjar med buk vänster', () => {
    expect(suggestSite([])).toBe('buk-vanster');
  });

  it('följer man förslagen roterar det genom alla sex ställen och börjar om', () => {
    const log: Injection[] = [];
    const used: InjectionSite[] = [];
    for (let week = 0; week < 8; week++) {
      const site = suggestSite(log);
      used.push(site);
      log.push(injection(`2026-09-${String(week + 1).padStart(2, '0')}`, { site }));
    }
    expect(used).toEqual([...order, order[0], order[1]]);
  });

  it('föreslår det ställe som använts längst tillbaka', () => {
    const log = [
      injection('2026-09-01', { site: 'lar-hoger' }),
      injection('2026-09-08', { site: 'buk-vanster' }),
      injection('2026-09-15', { site: 'buk-hoger' }),
      injection('2026-09-22', { site: 'lar-vanster' }),
      injection('2026-09-29', { site: 'overarm-vanster' }),
      injection('2026-10-06', { site: 'overarm-hoger' }),
    ];
    expect(suggestSite(log)).toBe('lar-hoger');
    // Oanvända ställen går först, i rotationsordning.
    expect(suggestSite(log.slice(1))).toBe('lar-hoger');
    expect(suggestSite(log.slice(0, 2))).toBe('buk-hoger');
  });

  it('räknar på datum och tid, inte registreringsordning, och hoppar över doser utan ställe', () => {
    const log = [
      injection('2026-09-06', { site: 'buk-vanster', time: '20:00' }),
      // Registrerad senare men tagen tidigare samma dag.
      injection('2026-09-06', { site: 'buk-hoger', time: '08:00' }),
      injection('2026-09-07', { site: 'lar-vanster' }),
      injection('2026-09-08', { site: 'lar-hoger' }),
      injection('2026-09-09', { site: 'overarm-vanster' }),
      injection('2026-09-10', { site: 'overarm-hoger' }),
      injection('2026-09-11'),
    ];
    expect(suggestSite(log)).toBe('buk-hoger');
  });
});
