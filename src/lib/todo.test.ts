import { describe, expect, it } from 'vitest';
import type { Medication, Supplement } from '../db/db.ts';
import { intakeFor } from './supplements.ts';
import { buildTodo, doseDayText, nextDoseText, type TodoInput } from './todo.ts';

// Torsdag 24 sep 2026 kl. 12:00 lokal tid.
const now = new Date(2026, 8, 24, 12, 0);
const today = '2026-09-24';

const vitamin: Supplement = {
  id: 'd',
  name: 'D-vitamin',
  form: 'tablett',
  amountPerDose: 1,
  nutrients: [],
  schedule: 'dagligen',
  dosesPerDay: 1,
  createdAt: 1,
};

/** Wegovy på lördagar kl. 08:00, 2,5 mg från 1 sep. */
const wegovy: Medication = {
  id: 'm1',
  name: 'Wegovy',
  frequency: 'vecka',
  weekday: 5,
  time: '08:00',
  steps: [{ date: '2026-09-01', doseMg: 2.5 }],
  createdAt: 1,
};

const empty: TodoInput = {
  supplements: [],
  supplementLog: [],
  medications: [],
  injections: [],
  workouts: [],
  workoutPlans: [],
  enabled: { tillskott: true, glp1: true, traning: true },
  backupDue: false,
};

describe('buildTodo', () => {
  it('inget väntar: tomt (kortet blir "Allt klart för idag")', () => {
    expect(buildTodo(empty, now).empty).toBe(true);
  });

  it('otagna tillskott väntar; bockade av försvinner', () => {
    const todo = buildTodo({ ...empty, supplements: [vitamin] }, now);
    expect(todo.supplements.map((s) => s.id)).toEqual(['d']);
    expect(todo.empty).toBe(false);
    const done = buildTodo(
      { ...empty, supplements: [vitamin], supplementLog: [intakeFor(vitamin, today)] },
      now,
    );
    expect(done.supplements).toEqual([]);
    expect(done.empty).toBe(true);
  });

  it('dagens planerade pass och obesvarade pass väntar, genomförda inte', () => {
    const todo = buildTodo(
      {
        ...empty,
        workouts: [
          {
            id: 'a',
            date: today,
            time: '18:00',
            type: 'Löpning',
            durationMin: 30,
            status: 'planerad',
            createdAt: 1,
          },
          {
            id: 'b',
            date: '2026-09-23',
            type: 'Yoga',
            durationMin: 45,
            status: 'planerad',
            createdAt: 1,
          },
          {
            id: 'c',
            date: today,
            time: '07:00',
            type: 'Cykel',
            durationMin: 20,
            status: 'genomford',
            createdAt: 1,
          },
        ],
      },
      now,
    );
    expect(todo.workouts.map((w) => w.id)).toEqual(['a']);
    expect(todo.unanswered.map((w) => w.id)).toEqual(['b']);
  });

  it('inte dosdag: raden Nästa dos, ingen dos att göra', () => {
    const todo = buildTodo({ ...empty, medications: [wegovy] }, now);
    expect(todo.doses).toEqual([]);
    expect(todo.empty).toBe(true);
    expect(todo.nextDose).toMatchObject({ date: '2026-09-26', doseMg: 2.5, site: 'Buk vänster' });
    if (!todo.nextDose) throw new Error('nästa dos saknas');
    expect(nextDoseText(todo.nextDose, today)).toBe('Nästa dos lör 26 sep · 2,5 mg · buk vänster');
  });

  it('dosdag: dosen väntar och Nästa dos visas inte', () => {
    const saturday = new Date(2026, 8, 26, 12, 0);
    const todo = buildTodo({ ...empty, medications: [wegovy] }, saturday);
    expect(todo.doses).toHaveLength(1);
    expect(todo.site).toBe('Buk vänster');
    expect(todo.nextDose).toBeNull();
  });

  it('avstängda funktioner räknas inte; säkerhetskopian väntar', () => {
    const todo = buildTodo(
      {
        ...empty,
        supplements: [vitamin],
        medications: [wegovy],
        enabled: { tillskott: false, glp1: false, traning: false },
        backupDue: true,
      },
      now,
    );
    expect(todo.supplements).toEqual([]);
    expect(todo.nextDose).toBeNull();
    expect(todo.backup).toBe(true);
    expect(todo.empty).toBe(false);
  });
});

describe('doseDayText', () => {
  it('idag, imorgon, annars veckodag och datum', () => {
    expect(doseDayText(today, today)).toBe('idag');
    expect(doseDayText('2026-09-25', today)).toBe('imorgon');
    expect(doseDayText('2026-10-04', today)).toBe('sön 4 okt');
  });
});
