import { describe, expect, it } from 'vitest';
import type { Injection, Medication } from '../db/db.ts';
import { addDays } from './dates.ts';
import {
  PLATEAU_SNOOZE_DAYS,
  analyzePlateau,
  comparisonRows,
  detectPlateau,
  plateauPromptLines,
  shouldShowPlateau,
  type PlateauAnalysisInput,
  type PlateauCheck,
  type PlateauProfile,
} from './plateau.ts';

const TODAY = '2026-09-28';

const profile: PlateauProfile = {
  startDate: addDays(TODAY, -90),
  startWeightKg: 95,
  heightCm: 175,
  goalWeightKg: 80,
  sex: 'kvinna',
  birthYear: 1985,
  activityLevel: 'latt',
  ratePerWeekKg: 0.5,
};

/** En vägning per dag `daysBack`…0 dagar bakåt; `kg(i)` där i = dagar bakåt. */
function weighings(daysBack: number, kg: (daysAgo: number) => number, skip = new Set<number>()) {
  const list: { date: string; weightKg: number }[] = [];
  for (let i = daysBack; i >= 0; i--) {
    if (!skip.has(i)) list.push({ date: addDays(TODAY, -i), weightKg: kg(i) });
  }
  return list;
}

/** Litet deterministiskt brus (±0,3 kg) som ändå ger en platt trend. */
const flat = (i: number) => 88 + ((i * 7) % 5) * 0.15 - 0.3;

describe('detectPlateau', () => {
  it('platå: trendvikten har ändrats < 0,2 kg på 21 dagar', () => {
    const check = detectPlateau({ profile, weights: weighings(60, flat), today: TODAY });
    expect(check.kind).toBe('plateau');
    if (check.kind !== 'plateau') return;
    expect(Math.abs(check.changeKg)).toBeLessThan(0.2);
    expect(check.from).toBe(addDays(TODAY, -20));
    expect(check.weighDays).toBe(21);
  });

  it('ingen platå när trenden går nedåt', () => {
    const check = detectPlateau({
      profile,
      weights: weighings(60, (i) => 88 + i * 0.07),
      today: TODAY,
    });
    expect(check.kind).toBe('no-plateau');
    if (check.kind === 'no-plateau') expect(check.changeKg).toBeLessThan(-0.2);
  });

  it('utvärderas inte med för få loggade viktdagar (< 70 % av 21)', () => {
    // 14 av 21 dagar = 67 %.
    const skip = new Set([1, 3, 5, 7, 9, 11, 13]);
    expect(detectPlateau({ profile, weights: weighings(60, flat, skip), today: TODAY })).toEqual({
      kind: 'not-evaluated',
      reason: 'too-few-weighins',
    });
    // 15 av 21 = 71 % räcker.
    const fewer = new Set([1, 3, 5, 7, 9, 11]);
    expect(detectPlateau({ profile, weights: weighings(60, flat, fewer), today: TODAY }).kind).toBe(
      'plateau',
    );
  });

  it('utvärderas inte för tidigt (< 4 veckor sedan start)', () => {
    const early = { ...profile, startDate: addDays(TODAY, -27) };
    expect(detectPlateau({ profile: early, weights: weighings(27, flat), today: TODAY })).toEqual({
      kind: 'not-evaluated',
      reason: 'too-early',
    });
    const ok = { ...profile, startDate: addDays(TODAY, -28) };
    expect(detectPlateau({ profile: ok, weights: weighings(28, flat), today: TODAY }).kind).toBe(
      'plateau',
    );
  });

  it('ingen platåvarning i viktstabiliseringsläget (takt 0)', () => {
    const maintain = { ...profile, ratePerWeekKg: 0 };
    expect(
      detectPlateau({ profile: maintain, weights: weighings(60, flat), today: TODAY }),
    ).toEqual({ kind: 'not-evaluated', reason: 'maintenance' });
  });

  it('utan takt i profilen gäller standardtakten 0,5 kg', () => {
    const rest = { ...profile };
    delete rest.ratePerWeekKg;
    expect(detectPlateau({ profile: rest, weights: weighings(60, flat), today: TODAY }).kind).toBe(
      'plateau',
    );
  });

  it('utan profil utvärderas ingenting', () => {
    expect(detectPlateau({ profile: null, weights: weighings(60, flat), today: TODAY })).toEqual({
      kind: 'not-evaluated',
      reason: 'no-profile',
    });
  });
});

describe('shouldShowPlateau – vilotid efter Stäng', () => {
  const plateau: PlateauCheck = {
    kind: 'plateau',
    changeKg: 0.1,
    from: addDays(TODAY, -20),
    to: TODAY,
    weighDays: 21,
  };

  it('visas när kortet aldrig stängts', () => {
    expect(shouldShowPlateau(plateau, null, TODAY)).toBe(true);
  });

  it('visas inte igen förrän 14 dagar efter att det stängts', () => {
    expect(shouldShowPlateau(plateau, TODAY, TODAY)).toBe(false);
    expect(shouldShowPlateau(plateau, addDays(TODAY, -(PLATEAU_SNOOZE_DAYS - 1)), TODAY)).toBe(
      false,
    );
    expect(shouldShowPlateau(plateau, addDays(TODAY, -PLATEAU_SNOOZE_DAYS), TODAY)).toBe(true);
  });

  it('visas aldrig utan platå', () => {
    expect(shouldShowPlateau({ ...plateau, kind: 'no-plateau' }, null, TODAY)).toBe(false);
    expect(shouldShowPlateau({ kind: 'not-evaluated', reason: 'maintenance' }, null, TODAY)).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------

const food = (date: string, kcal: number) => ({
  date,
  grams: 100,
  per100: { kcal, proteinG: 0, carbsG: 0, fatG: 0 },
});

/** Mat, steg och pass per dag `from`…`to` dagar bakåt (inklusive). */
function daily<T>(from: number, to: number, make: (date: string, daysAgo: number) => T): T[] {
  const list: T[] = [];
  for (let i = from; i >= to; i--) list.push(make(addDays(TODAY, -i), i));
  return list;
}

function baseInput(): PlateauAnalysisInput {
  return {
    profile,
    weights: weighings(60, flat),
    foodLog: [],
    steps: [],
    workouts: [],
    medications: [],
    injections: [],
  };
}

describe('analyzePlateau – senaste 3 veckorna mot de 3 innan', () => {
  it('perioderna är hela dagar t.o.m. igår', () => {
    const { recent, previous } = analyzePlateau(baseInput(), TODAY);
    expect(recent).toMatchObject({ from: addDays(TODAY, -21), to: addDays(TODAY, -1), days: 21 });
    expect(previous).toMatchObject({ from: addDays(TODAY, -42), to: addDays(TODAY, -22) });
  });

  it('snittintag, loggade matdagar, snittsteg och pass per vecka per period', () => {
    const input: PlateauAnalysisInput = {
      ...baseInput(),
      // Tidigare: 1 600 kcal alla dagar. Senaste: 1 900 kcal, bara 14 av 21 dagar.
      foodLog: [
        ...daily(42, 22, (d) => food(d, 1600)),
        ...daily(21, 1, (d, i) => (i % 3 === 0 ? null : food(d, 1900))).filter((e) => e !== null),
      ],
      steps: [
        ...daily(42, 22, (date) => ({ date, steps: 9000, createdAt: 1 })),
        ...daily(21, 1, (date) => ({ date, steps: 6000, createdAt: 1 })),
      ],
      workouts: [
        ...[40, 38, 35, 33, 30, 28, 25, 23, 22].map((i) => ({
          date: addDays(TODAY, -i),
          status: 'genomford',
        })),
        { date: addDays(TODAY, -10), status: 'genomford' },
        { date: addDays(TODAY, -5), status: 'hoppad' },
      ],
    };
    const a = analyzePlateau(input, TODAY);
    expect(a.previous.kcal).toBe(1600);
    expect(a.recent.kcal).toBe(1900);
    expect(a.previous.foodDays).toBe(21);
    expect(a.recent.foodDays).toBe(14);
    expect(a.recent.foodShare).toBeCloseTo(14 / 21);
    expect(a.previous.steps).toBe(9000);
    expect(a.recent.steps).toBe(6000);
    expect(a.previous.workoutsPerWeek).toBe(3);
    expect(a.recent.workoutsPerWeek).toBeCloseTo(1 / 3);

    const ids = a.explanations.map((e) => e.id);
    expect(ids).toContain('intag-upp');
    expect(ids).toContain('farre-steg');
    expect(ids).toContain('farre-pass');
    expect(ids).toContain('farre-loggade');
    // Mest sannolik först: +300 kcal väger tyngst.
    expect(ids[0]).toBe('intag-upp');
    expect(a.explanations.find((e) => e.id === 'intag-upp')?.text).toContain('300 kcal högre');
  });

  it('adaptiv TDEE jämförs mot tidigare period', () => {
    const a = analyzePlateau(baseInput(), TODAY);
    expect(a.recent.tdee).not.toBeNull();
    expect(a.previous.tdee).not.toBeNull();
    // Utan matlogg är det formeln.
    expect(a.recent.tdeeSource).toBe('formel');
    const rows = comparisonRows(a);
    expect(rows.find((r) => r.id === 'tdee')?.recent).toMatch(/kcal \(formel\)$/);
  });

  it('adaptiv TDEE: loggat intag som motsvarar förbrukningen ger förklaringen "nära förbrukningen"', () => {
    const input: PlateauAnalysisInput = {
      ...baseInput(),
      // Stabil vikt i 42 dagar med 2 000 kcal → observerad TDEE ≈ 2 000.
      foodLog: daily(60, 1, (d) => food(d, 2000)),
    };
    const a = analyzePlateau(input, TODAY);
    expect(a.recent.tdeeSource).toBe('adaptiv');
    expect(a.explanations.map((e) => e.id)).toContain('nara-forbrukning');
    expect(a.explanations.map((e) => e.id)).not.toContain('intag-upp');
  });

  it('sänkt GLP-1-dos lyfts fram, en höjning listas bara som dosbyte', () => {
    const med: Medication = {
      id: 'm',
      name: 'Wegovy',
      frequency: 'vecka',
      weekday: 0,
      time: '08:00',
      steps: [{ date: addDays(TODAY, -60), doseMg: 1 }],
      createdAt: 0,
    };
    const inj = (daysAgo: number, doseMg: number): Injection => ({
      id: `i${String(daysAgo)}`,
      date: addDays(TODAY, -daysAgo),
      medicationId: 'm',
      medicationName: 'Wegovy',
      doseMg,
      createdAt: daysAgo,
    });
    const lowered = analyzePlateau(
      { ...baseInput(), medications: [med], injections: [inj(35, 1), inj(28, 1), inj(14, 0.5)] },
      TODAY,
    );
    expect(lowered.doseChanges).toHaveLength(1);
    expect(lowered.doseChanges[0]?.lower).toBe(true);
    expect(lowered.explanations.map((e) => e.id)).toContain('dosandring');
    expect(lowered.recent.doses).toEqual(['Wegovy 0,5 mg']);
    expect(lowered.previous.doses).toEqual(['Wegovy 1 mg']);

    const raised = analyzePlateau(
      { ...baseInput(), medications: [med], injections: [inj(35, 0.5), inj(14, 1)] },
      TODAY,
    );
    expect(raised.doseChanges).toHaveLength(1);
    expect(raised.explanations.map((e) => e.id)).not.toContain('dosandring');
  });

  it('inga tydliga skillnader ger inga förklaringar', () => {
    const input: PlateauAnalysisInput = {
      ...baseInput(),
      steps: daily(42, 1, (date) => ({ date, steps: 8000, createdAt: 1 })),
      workouts: daily(42, 1, (date, i) => ({ date, status: i % 7 === 0 ? 'genomford' : 'x' })),
    };
    const a = analyzePlateau(input, TODAY);
    expect(a.explanations.map((e) => e.id)).toEqual([]);
  });

  it('underlaget till Fråga AI innehåller jämförelsen och förklaringarna', () => {
    const input: PlateauAnalysisInput = {
      ...baseInput(),
      foodLog: [...daily(42, 22, (d) => food(d, 1500)), ...daily(21, 1, (d) => food(d, 1800))],
    };
    const check = detectPlateau({ profile, weights: input.weights, today: TODAY });
    if (check.kind !== 'plateau') throw new Error('väntade platå');
    const a = analyzePlateau(input, TODAY);
    const lines = plateauPromptLines(check, a, comparisonRows(a), a.explanations.slice(0, 2));
    expect(lines[0]).toMatch(/^Trendvikten har ändrats/);
    expect(lines).toContain('- Snittintag: 1 800 kcal (innan 1 500 kcal)');
    expect(lines).toContain('Möjliga förklaringar enligt appen:');
  });
});
