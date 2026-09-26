import { describe, expect, it } from 'vitest';
import type { Workout, WorkoutPlan } from '../db/db.ts';
import {
  answerWorkout,
  describePlan,
  displayStatus,
  findUnanswered,
  hasPassed,
  planDates,
  todaysWorkouts,
  upcomingWorkouts,
  workoutTypes,
  workoutsBetween,
} from './workouts.ts';

/** Mån/ons/fre 07:00 från måndag 2026-09-14. */
const plan: WorkoutPlan = {
  id: 'p',
  type: 'Löpning',
  weekdays: [0, 2, 4],
  time: '07:00',
  durationMin: 30,
  intensity: 'medel',
  startDate: '2026-09-14',
  createdAt: 1,
};

/** Lokal tid – appen räknar i användarens tidszon. */
function at(date: string, time: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, min = 0] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

describe('återkommande scheman', () => {
  it('ger rätt veckodagar i intervallet', () => {
    expect(planDates(plan, '2026-09-14', '2026-09-27')).toEqual([
      '2026-09-14', // mån
      '2026-09-16', // ons
      '2026-09-18', // fre
      '2026-09-21',
      '2026-09-23',
      '2026-09-25',
    ]);
  });

  it('respekterar start- och slutdatum', () => {
    expect(planDates(plan, '2026-09-01', '2026-09-16')).toEqual(['2026-09-14', '2026-09-16']);
    expect(planDates({ ...plan, endDate: '2026-09-21' }, '2026-09-14', '2026-09-30')).toEqual([
      '2026-09-14',
      '2026-09-16',
      '2026-09-18',
      '2026-09-21',
    ]);
    expect(planDates(plan, '2026-09-01', '2026-09-10')).toEqual([]);
  });

  it('fungerar över månads- och årsskiften', () => {
    const sunday = { ...plan, weekdays: [6], startDate: '2026-12-01' };
    expect(planDates(sunday, '2026-12-25', '2027-01-10')).toEqual([
      '2026-12-27',
      '2027-01-03',
      '2027-01-10',
    ]);
  });

  it('sparade pass ersätter de genererade och sorteras efter tid', () => {
    const done: Workout = {
      id: 'p:2026-09-16',
      date: '2026-09-16',
      time: '07:00',
      type: 'Löpning',
      durationMin: 40,
      status: 'genomford',
      planId: 'p',
      createdAt: 5,
    };
    const extra: Workout = {
      id: 'x',
      date: '2026-09-16',
      time: '06:00',
      type: 'Yoga',
      durationMin: 20,
      status: 'planerad',
      createdAt: 6,
    };
    const allDay: Workout = { ...extra, id: 'y', time: undefined as never, type: 'Promenad' };
    delete allDay.time;
    const items = workoutsBetween([done, extra, allDay], [plan], '2026-09-16', '2026-09-18');
    expect(items.map((w) => [w.id, w.status, w.stored])).toEqual([
      ['x', 'planerad', true],
      ['p:2026-09-16', 'genomford', true],
      ['y', 'planerad', true],
      ['p:2026-09-18', 'planerad', false],
    ]);
    expect(items[3]).toMatchObject({ type: 'Löpning', durationMin: 30, intensity: 'medel' });
  });

  it('beskrivning av schemat', () => {
    expect(describePlan(plan)).toBe('mån, ons, fre 07:00');
    expect(describePlan({ weekdays: [4, 3, 2, 1, 0], time: '18:30' })).toBe('Vardagar 18:30');
    expect(describePlan({ weekdays: [0, 1, 2, 3, 4, 5, 6], time: '06:00' })).toBe(
      'Varje dag 06:00',
    );
  });
});

describe('obesvarade pass', () => {
  it('ett pass har passerat när tiden gått; utan tid först nästa dag', () => {
    const now = at('2026-09-16', '07:30');
    expect(hasPassed({ date: '2026-09-16', time: '07:00' }, now)).toBe(true);
    expect(hasPassed({ date: '2026-09-16', time: '07:30' }, now)).toBe(true);
    expect(hasPassed({ date: '2026-09-16', time: '08:00' }, now)).toBe(false);
    expect(hasPassed({ date: '2026-09-16' }, now)).toBe(false);
    expect(hasPassed({ date: '2026-09-15' }, now)).toBe(true);
    expect(hasPassed({ date: '2026-09-17', time: '00:00' }, now)).toBe(false);
  });

  it('hittar passerade planerade pass som inte besvarats, äldst först', () => {
    const answered: Workout = {
      id: 'p:2026-09-14',
      date: '2026-09-14',
      time: '07:00',
      type: 'Löpning',
      durationMin: 30,
      status: 'hoppad',
      planId: 'p',
      createdAt: 5,
    };
    const oneOff: Workout = {
      id: 'o',
      date: '2026-09-15',
      type: 'Simning',
      durationMin: 45,
      status: 'planerad',
      createdAt: 6,
    };
    const now = at('2026-09-18', '06:59');
    const missed = findUnanswered([answered, oneOff], [plan], now);
    // Mån besvarad; tis (engångspass utan tid) och ons obesvarade; fre 07:00 ännu inte passerat.
    expect(missed.map((w) => w.id)).toEqual(['o', 'p:2026-09-16']);

    const later = findUnanswered([answered, oneOff], [plan], at('2026-09-18', '07:00'));
    expect(later.map((w) => w.id)).toEqual(['o', 'p:2026-09-16', 'p:2026-09-18']);
  });

  it('genomförda och hoppade pass räknas inte, inte heller äldre än 28 dagar', () => {
    const old = { ...plan, startDate: '2026-08-01' };
    const missed = findUnanswered([], [old], at('2026-09-18', '12:00'));
    expect(missed[0]?.date).toBe('2026-08-21'); // 28 dagar bakåt, första fredagen
    expect(missed.every((w) => w.date >= '2026-08-21')).toBe(true);
  });

  it('visningsstatus: obesvarad först när tiden passerat', () => {
    const item = workoutsBetween([], [plan], '2026-09-16', '2026-09-16')[0];
    if (!item) throw new Error('saknas');
    expect(displayStatus(item, at('2026-09-16', '06:00'))).toBe('planerad');
    expect(displayStatus(item, at('2026-09-16', '07:01'))).toBe('obesvarad');
    expect(displayStatus({ ...item, status: 'genomford' }, at('2026-09-16', '07:01'))).toBe(
      'genomford',
    );
  });

  it('dagens pass utan de obesvarade; kommande börjar i morgon', () => {
    const evening: Workout = {
      id: 'k',
      date: '2026-09-16',
      time: '18:00',
      type: 'Yoga',
      durationMin: 30,
      status: 'planerad',
      createdAt: 7,
    };
    const now = at('2026-09-16', '12:00');
    expect(todaysWorkouts([evening], [plan], now).map((w) => w.id)).toEqual(['k']);
    expect(upcomingWorkouts([evening], [plan], now).map((w) => w.date)).toEqual([
      '2026-09-18',
      '2026-09-21',
      '2026-09-23',
    ]);
  });
});

describe('besvara pass', () => {
  it('ett genererat pass sparas med faktisk längd och intensitet', () => {
    const [item] = workoutsBetween([], [plan], '2026-09-16', '2026-09-16');
    if (!item) throw new Error('saknas');
    const saved = answerWorkout(
      item,
      { status: 'genomford', durationMin: 42, intensity: 'hog' },
      100,
    );
    expect(saved).toEqual({
      id: 'p:2026-09-16',
      date: '2026-09-16',
      time: '07:00',
      type: 'Löpning',
      durationMin: 42,
      intensity: 'hog',
      status: 'genomford',
      planId: 'p',
      createdAt: 100,
    });
  });

  it('ett sparat pass får updatedAt, intensiteten kan tas bort', () => {
    const [item] = workoutsBetween(
      [
        {
          id: 'x',
          date: '2026-09-16',
          type: 'Yoga',
          durationMin: 20,
          intensity: 'latt',
          status: 'genomford',
          createdAt: 1,
        },
      ],
      [],
      '2026-09-16',
      '2026-09-16',
    );
    if (!item) throw new Error('saknas');
    const saved = answerWorkout(item, { status: 'hoppad', intensity: null }, 50);
    expect(saved).toEqual({
      id: 'x',
      date: '2026-09-16',
      type: 'Yoga',
      durationMin: 20,
      status: 'hoppad',
      createdAt: 1,
      updatedAt: 50,
    });
  });

  it('egna typer följer efter förvalen', () => {
    expect(
      workoutTypes([{ type: 'Klättring' }, { type: 'Löpning' }], [{ type: 'Boxning' }]),
    ).toEqual([
      'Promenad',
      'Löpning',
      'Cykling',
      'Styrketräning',
      'Simning',
      'Yoga',
      'Boxning',
      'Klättring',
    ]);
  });
});
