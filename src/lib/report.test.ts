import { describe, expect, it } from 'vitest';
import type {
  FoodLogEntry,
  Injection,
  Medication,
  PhotoSession,
  Profile,
  SupplementIntake,
} from '../db/db.ts';
import { addDays } from './dates.ts';
import {
  DEFAULT_REPORT_SETTINGS,
  buildReport,
  parseReportSettings,
  reportPhotoSessions,
  reportRange,
  type ReportInput,
} from './report.ts';

// Måndag.
const TODAY = '2026-09-28';
const ago = (days: number) => addDays(TODAY, -days);

const profile: Profile = {
  startDate: ago(120),
  startWeightKg: 100,
  heightCm: 180,
  goalWeightKg: 85,
  sex: 'man',
  birthYear: 1980,
  activityLevel: 'latt',
  ratePerWeekKg: 0.5,
};

function empty(): ReportInput {
  return {
    profile,
    weights: [],
    waist: [],
    steps: [],
    foodLog: [],
    workouts: [],
    medications: [],
    injections: [],
    symptoms: [],
    supplements: [],
    supplementLog: [],
  };
}

function entry(
  date: string,
  kcal: number,
  proteinG: number,
  extra: Partial<FoodLogEntry> = {},
): FoodLogEntry {
  return {
    id: `${date}:${String(kcal)}`,
    date,
    meal: 'lunch',
    foodId: 'lv:1',
    name: 'Mat',
    amount: 100,
    unit: 'g',
    grams: 100,
    per100: { kcal, proteinG, carbsG: 0, fatG: 0 },
    createdAt: 0,
    ...extra,
  };
}

describe('reportSettings', () => {
  it('bilder är avkryssade som standard, allt annat med', () => {
    expect(DEFAULT_REPORT_SETTINGS.sections.bilder).toBe(false);
    expect(
      Object.entries(DEFAULT_REPORT_SETTINGS.sections).filter(([id, on]) => id !== 'bilder' && !on),
    ).toEqual([]);
  });

  it('tolkar sparade val och ersätter okända värden med standard', () => {
    const parsed = parseReportSettings({
      period: 'egen',
      customFrom: '2026-07-01',
      customTo: 'fel',
      sections: { bilder: true, kost: false, okand: true },
    });
    expect(parsed.period).toBe('egen');
    expect(parsed.customFrom).toBe('2026-07-01');
    expect(parsed.customTo).toBeNull();
    expect(parsed.sections.bilder).toBe(true);
    expect(parsed.sections.kost).toBe(false);
    expect(parsed.sections.vikt).toBe(true);
    expect(parseReportSettings(null)).toEqual(DEFAULT_REPORT_SETTINGS);
    expect(parseReportSettings({ period: 'år' }).period).toBe('12v');
  });
});

describe('reportRange', () => {
  const base = { customFrom: null, customTo: null };
  const input = { profile, weights: [{ date: ago(130) }] };

  it('4 och 12 veckor slutar idag', () => {
    expect(reportRange({ ...base, period: '4v' }, input, TODAY)).toEqual({
      from: ago(27),
      to: TODAY,
    });
    expect(reportRange({ ...base, period: '12v' }, input, TODAY)).toEqual({
      from: ago(83),
      to: TODAY,
    });
  });

  it('sedan start: startdatum eller första vägningen om den är tidigare', () => {
    expect(reportRange({ ...base, period: 'start' }, input, TODAY)?.from).toBe(ago(130));
    expect(reportRange({ ...base, period: 'start' }, { profile, weights: [] }, TODAY)?.from).toBe(
      ago(120),
    );
    expect(
      reportRange({ ...base, period: 'start' }, { profile: null, weights: [] }, TODAY),
    ).toEqual({ from: TODAY, to: TODAY });
  });

  it('egen period: kräver båda datumen i ordning och kortar till idag', () => {
    expect(reportRange({ period: 'egen', customFrom: ago(10), customTo: null }, input, TODAY)).toBe(
      null,
    );
    expect(
      reportRange({ period: 'egen', customFrom: ago(5), customTo: ago(10) }, input, TODAY),
    ).toBeNull();
    expect(
      reportRange(
        { period: 'egen', customFrom: ago(10), customTo: addDays(TODAY, 5) },
        input,
        TODAY,
      ),
    ).toEqual({ from: ago(10), to: TODAY });
  });
});

describe('buildReport – aggregering per period', () => {
  const range = { from: ago(83), to: TODAY };

  it('grunddata: trendvikt vid periodens slut, förändring i kg och %, BMI', () => {
    const input: ReportInput = {
      ...empty(),
      weights: Array.from({ length: 121 }, (_, i) => ({
        id: String(i),
        date: ago(120 - i),
        weightKg: 100 - i * 0.1,
        createdAt: 0,
      })),
    };
    const r = buildReport(input, range, TODAY);
    expect(r.days).toBe(84);
    const b = r.basics;
    expect(b).not.toBeNull();
    if (!b) return;
    // Trenden (EMA) ligger lite efter dagsvikten (88 kg).
    expect(b.trendKg).toBeGreaterThan(88);
    expect(b.trendKg).toBeLessThan(89.5);
    expect(b.changeKg).toBeCloseTo(b.trendKg - 100);
    expect(b.changePct).toBeCloseTo(b.changeKg);
    expect(b.periodChangeKg).toBeCloseTo(-8.4, 0);
    expect(b.bmi).toBeCloseTo(b.trendKg / 1.8 ** 2);
    expect(b.bmiCategory).toBe('Övervikt');
    // Viktgrafen: bara dagar i perioden.
    expect(r.weight.points).toHaveLength(84);
    expect(r.weight.points[0]?.date).toBe(range.from);
    expect(r.weight.trend).toHaveLength(84);
  });

  it('utan profil saknas grunddata', () => {
    expect(buildReport({ ...empty(), profile: null }, range, TODAY).basics).toBeNull();
  });

  it('kost: snitt per loggad dag, andel loggade dagar och fiber ur Livsmedelsverket', () => {
    const input: ReportInput = {
      ...empty(),
      foodLog: [
        entry(ago(100), 5000, 10), // före perioden
        entry(ago(10), 1500, 100),
        entry(ago(10), 500, 20, { id: 'b', foodId: 'egen:x' }),
        entry(ago(5), 1800, 80),
        entry(ago(2), 700, 35, { id: 's', foodId: 'snabb:x:700:35', estimated: true }),
      ],
    };
    const r = buildReport(input, range, TODAY, {
      meals: [],
      lookup: (id) => (id === 'lv:1' ? { fiberG: 10 } : null),
    });
    expect(r.diet.foodDays).toBe(3);
    expect(r.diet.kcal).toBeCloseTo((2000 + 1800 + 700) / 3);
    expect(r.diet.proteinG).toBeCloseTo((120 + 80 + 35) / 3);
    expect(r.diet.loggedShare).toBeCloseTo(3 / 84);
    // 10 g fiber per 100 g lv:1 × två poster; egen:x saknar data, snabbloggen räknas inte.
    expect(r.diet.fiberG).toBeCloseTo(20 / 3);
    expect(r.diet.fiberCoverage).toBeCloseTo(200 / 300);
    expect(r.diet.estimatedEntries).toBe(1);
    expect(r.diet.proteinGoalG).toBe(136);
    // Utan Livsmedelsverkets data är fibern okänd.
    expect(buildReport(input, range, TODAY).diet.fiberG).toBeNull();
  });

  it('midja, steg och träning per vecka', () => {
    const input: ReportInput = {
      ...empty(),
      waist: [
        { date: ago(90), waistCm: 110, createdAt: 0 },
        { date: ago(80), waistCm: 106, createdAt: 0 },
        { date: ago(3), waistCm: 101.5, createdAt: 0 },
      ],
      steps: [
        { date: ago(90), steps: 20000, createdAt: 0 },
        { date: ago(4), steps: 6000, createdAt: 0 },
        { date: ago(3), steps: 8000, createdAt: 0 },
      ],
      workouts: [
        { date: ago(90), status: 'genomford', durationMin: 30 },
        { date: ago(7), status: 'genomford', durationMin: 45 },
        { date: ago(6), status: 'genomford', durationMin: 30 },
        { date: ago(1), status: 'hoppad', durationMin: 30 },
        { date: TODAY, status: 'genomford', durationMin: 60 },
      ],
    };
    const r = buildReport(input, range, TODAY);
    expect(r.waist.entries.map((w) => w.value)).toEqual([106, 101.5]);
    expect(r.waist.changeCm).toBeCloseTo(-4.5);
    expect(r.steps.average).toBe(7000);
    expect(r.steps.days).toBe(2);
    expect(r.training.done).toBe(3);
    expect(r.training.minutes).toBe(135);
    expect(r.training.perWeek).toBeCloseTo(0.25);
    // 12 veckor + veckan med idag (måndag), från måndagen i periodens första vecka.
    expect(r.training.weeks).toHaveLength(13);
    expect(r.training.weeks.at(-1)).toEqual({ from: TODAY, count: 1, minutes: 60 });
    expect(r.training.weeks.at(-2)).toEqual({ from: ago(7), count: 2, minutes: 75 });
  });

  it('tillskott: dagar med tagen dos per tillskott', () => {
    const intake = (id: string, date: string, doses = 1): SupplementIntake => ({
      id: `${id}:${date}`,
      date,
      supplementId: id,
      name: id === 'd' ? 'D-vitamin' : 'Järn',
      doses,
      nutrients: [],
      createdAt: 0,
    });
    const r = buildReport(
      {
        ...empty(),
        supplementLog: [
          intake('d', ago(100)),
          intake('d', ago(3)),
          intake('d', ago(2)),
          intake('fe', ago(2)),
          intake('fe', ago(1), 0),
        ],
      },
      range,
      TODAY,
    );
    expect(r.supplements).toEqual([
      { name: 'D-vitamin', days: 2, description: null },
      { name: 'Järn', days: 1, description: null },
    ]);
  });

  it('GLP-1: gällande dos, dosbyten, missade doser, aptit och biverkningar', () => {
    const med: Medication = {
      id: 'm',
      name: 'Wegovy',
      frequency: 'vecka',
      weekday: 0, // måndagar
      time: '08:00',
      steps: [
        { date: ago(119), doseMg: 0.25 },
        { date: ago(35), doseMg: 0.5 },
      ],
      createdAt: 0,
    };
    // Varje måndag från ago(119) utom ago(21) och ago(14); idag är inte loggat än.
    const injections: Injection[] = [];
    for (let d = 119; d >= 7; d -= 7) {
      if (d === 21 || d === 14) continue;
      injections.push({
        id: String(d),
        date: ago(d),
        medicationId: 'm',
        medicationName: 'Wegovy',
        doseMg: d > 35 ? 0.25 : 0.5,
        createdAt: d,
      });
    }
    const r = buildReport(
      {
        ...empty(),
        medications: [med],
        injections,
        symptoms: [
          { date: ago(100), appetite: 1, sideEffects: ['Kräkning'], createdAt: 0 },
          { date: ago(30), appetite: 2, sideEffects: ['Illamående'], createdAt: 0 },
          { date: ago(20), sideEffects: ['Illamående', 'Trötthet'], createdAt: 0 },
          { date: ago(10), appetite: 4, sideEffects: [], createdAt: 0 },
        ],
      },
      range,
      TODAY,
    );
    const g = r.glp1;
    expect(g.medications).toEqual([
      { name: 'Wegovy', schedule: 'Varje måndag 08:00', ended: null },
    ]);
    expect(g.timeline.map((t) => [t.kind, t.doseMg])).toEqual([
      ['gällande', 0.25],
      ['byte', 0.5],
    ]);
    // Måndagar i perioden: ago(77) … ago(0) = 12; idag och fönstret ±3 dagar räknas inte än.
    expect(g.scheduled).toBe(11);
    expect(g.missed.map((m) => m.date)).toEqual([ago(21), ago(14)]);
    expect(g.injections).toBe(9);
    expect(g.appetite).toEqual([
      { date: ago(30), value: 2 },
      { date: ago(10), value: 4 },
    ]);
    expect(g.sideEffects).toEqual([
      { name: 'Illamående', days: 2 },
      { name: 'Trötthet', days: 1 },
    ]);
    expect(g.symptomDays).toBe(3);
  });

  it('4 veckor: bara det som hänt de senaste 28 dagarna räknas', () => {
    const input: ReportInput = {
      ...empty(),
      foodLog: [entry(ago(40), 1000, 50), entry(ago(20), 2000, 100)],
      steps: [
        { date: ago(40), steps: 2000, createdAt: 0 },
        { date: ago(20), steps: 10000, createdAt: 0 },
      ],
    };
    const r4 = buildReport(input, { from: ago(27), to: TODAY }, TODAY);
    expect(r4.days).toBe(28);
    expect(r4.diet.kcal).toBe(2000);
    expect(r4.steps.average).toBe(10000);
    const r12 = buildReport(input, range, TODAY);
    expect(r12.diet.kcal).toBe(1500);
    expect(r12.steps.average).toBe(6000);
  });
});

describe('reportPhotoSessions', () => {
  const session = (id: string, date: string): PhotoSession => ({ id, date, createdAt: 0 });

  it('första och senaste tillfället i perioden', () => {
    const sessions = [
      session('a', ago(100)),
      session('b', ago(60)),
      session('c', ago(30)),
      session('d', ago(2)),
    ];
    expect(reportPhotoSessions(sessions, { from: ago(83), to: TODAY }).map((s) => s.id)).toEqual([
      'b',
      'd',
    ]);
    expect(reportPhotoSessions(sessions, { from: ago(40), to: ago(20) }).map((s) => s.id)).toEqual([
      'c',
    ]);
    expect(reportPhotoSessions(sessions, { from: ago(10), to: ago(5) })).toEqual([]);
  });
});
