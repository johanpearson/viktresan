import { describe, expect, it } from 'vitest';
import { addDays } from './dates.ts';
import {
  WEEK_ROWS,
  compareValues,
  isoWeekNumber,
  lastCompletedWeek,
  mondayOf,
  pastWeeks,
  summarizeWeek,
  weekHeadline,
  weekLoggedText,
  weekTitle,
  type WeekInput,
  type WeekSummary,
} from './weekSummary.ts';

// 2026-09-14 är en måndag (vecka 38).
const MON = '2026-09-14';

const profile = {
  startWeightKg: 90,
  heightCm: 180,
  goalWeightKg: 80,
  sex: 'kvinna' as const,
  birthYear: 1985,
  activityLevel: 'latt' as const,
  ratePerWeekKg: 0.5,
};

function empty(): WeekInput {
  return { weights: [], foodLog: [], water: [], workouts: [], steps: [], profile };
}

const food = (date: string, kcal: number, proteinG: number) => ({
  date,
  grams: 100,
  per100: { kcal, proteinG, carbsG: 0, fatG: 0 },
});

describe('veckor', () => {
  it('måndag, ISO-veckonummer och titel', () => {
    expect(mondayOf('2026-09-14')).toBe(MON);
    expect(mondayOf('2026-09-20')).toBe(MON);
    expect(mondayOf('2026-09-21')).toBe('2026-09-21');
    expect(isoWeekNumber(MON)).toBe(38);
    expect(isoWeekNumber('2026-01-01')).toBe(1);
    expect(isoWeekNumber('2027-01-01')).toBe(53);
  });
});

describe('summarizeWeek', () => {
  it('summerar trend, intag, protein, vatten, pass och steg', () => {
    const input: WeekInput = {
      ...empty(),
      weights: [
        { date: '2026-09-13', weightKg: 85 },
        { date: '2026-09-16', weightKg: 84 },
        { date: '2026-09-20', weightKg: 84 },
      ],
      foodLog: [
        food('2026-09-14', 1800, 100),
        food('2026-09-15', 1600, 120),
        food('2026-09-15', 200, 20),
        // Utanför veckan.
        food('2026-09-21', 5000, 10),
      ],
      water: [
        { date: '2026-09-14', ml: 1000 },
        { date: '2026-09-14', ml: 500 },
        { date: '2026-09-18', ml: 2500 },
      ],
      workouts: [
        { date: '2026-09-15', status: 'genomford' },
        { date: '2026-09-17', status: 'hoppad' },
        { date: '2026-09-19', status: 'genomford' },
        { date: '2026-09-20', status: 'planerad' },
      ],
      steps: [
        { date: '2026-09-14', steps: 6000, createdAt: 1 },
        { date: '2026-09-15', steps: 10000, createdAt: 2 },
      ],
    };
    const s = summarizeWeek(input, MON);
    expect(s.from).toBe(MON);
    expect(s.to).toBe('2026-09-20');
    expect(s.weighDays).toBe(2);
    // Trend före veckan 85; EMA 3 dagar mot 84, sedan 4 dagar mot 84.
    const t1 = 85 + (1 - 0.9 ** 3) * (84 - 85);
    const t2 = t1 + (1 - 0.9 ** 4) * (84 - t1);
    expect(s.trendChangeKg).toBeCloseTo(t2 - 85, 6);
    expect(s.kcal).toBe(1800);
    expect(s.proteinG).toBe(120);
    expect(s.foodDays).toBe(2);
    expect(s.targetKcal).toBeGreaterThan(1000);
    expect(s.proteinGoalG).toBe(128);
    expect(s.waterMl).toBe(2000);
    expect(s.waterDays).toBe(2);
    expect(s.waterGoalMl).toBeGreaterThan(0);
    expect(s.workoutsDone).toBe(2);
    expect(s.steps).toBe(8000);
    expect(s.stepsDays).toBe(2);
    // 14, 15, 16, 18, 19, 20.
    expect(s.loggedDays).toBe(6);
  });

  it('vecka utan data ger tomma värden', () => {
    const s = summarizeWeek(empty(), MON);
    expect(s).toMatchObject({
      trendChangeKg: null,
      kcal: null,
      proteinG: null,
      waterMl: null,
      steps: null,
      workoutsDone: 0,
      loggedDays: 0,
    });
  });

  it('ingen vägning i veckan: trenden saknas även om tidigare vägningar finns', () => {
    const input = { ...empty(), weights: [{ date: '2026-09-10', weightKg: 85 }] };
    expect(summarizeWeek(input, MON).trendChangeKg).toBeNull();
  });

  it('utan tidigare vägning räknas trenden från veckans första vägning', () => {
    const input = {
      ...empty(),
      weights: [
        { date: '2026-09-14', weightKg: 86 },
        { date: '2026-09-15', weightKg: 85 },
      ],
    };
    expect(summarizeWeek(input, MON).trendChangeKg).toBeCloseTo(-0.1, 6);
    // En enda vägning ger ingen förändring att visa.
    const one = { ...empty(), weights: [{ date: '2026-09-14', weightKg: 86 }] };
    expect(summarizeWeek(one, MON).trendChangeKg).toBeNull();
  });

  it('snitt räknas bara över loggade dagar (luckor är inte noll)', () => {
    const input = {
      ...empty(),
      foodLog: [food('2026-09-14', 2000, 80), food('2026-09-20', 1600, 120)],
      steps: [{ date: '2026-09-17', steps: 9000, createdAt: 1 }],
    };
    const s = summarizeWeek(input, MON);
    expect(s.kcal).toBe(1800);
    expect(s.proteinG).toBe(100);
    expect(s.foodDays).toBe(2);
    expect(s.steps).toBe(9000);
  });

  it('utan profil saknas mål men veckan summeras ändå', () => {
    const input = { ...empty(), profile: null, foodLog: [food('2026-09-14', 2000, 80)] };
    const s = summarizeWeek(input, MON);
    expect(s.targetKcal).toBeNull();
    expect(s.proteinGoalG).toBeNull();
    expect(s.waterGoalMl).toBeNull();
    expect(s.kcal).toBe(2000);
  });
});

describe('lastCompletedWeek och pastWeeks', () => {
  it('förra veckan räknat från vilken dag som helst i veckan', () => {
    const input = { ...empty(), foodLog: [food('2026-09-15', 2000, 80)] };
    expect(lastCompletedWeek(input, '2026-09-21').summary.from).toBe(MON);
    expect(lastCompletedWeek(input, '2026-09-27').summary.from).toBe(MON);
    expect(lastCompletedWeek(input, '2026-09-21').previous.from).toBe('2026-09-07');
  });

  it('hoppar över veckor utan data och jämför mot kalenderveckan innan', () => {
    const input: WeekInput = {
      ...empty(),
      foodLog: [
        food('2026-08-31', 2000, 80), // v36
        // v37 saknas helt.
        food('2026-09-15', 1800, 100), // v38
        food('2026-09-22', 1700, 110), // v39
      ],
    };
    const weeks = pastWeeks(input, '2026-09-30');
    expect(weeks.map((w) => w.summary.from)).toEqual(['2026-09-21', MON, '2026-08-31']);
    // Veckan efter en lucka jämförs mot den tomma veckan: inget att jämföra.
    const v38 = weeks[1];
    expect(v38?.previous.from).toBe('2026-09-07');
    expect(v38?.previous.kcal).toBeNull();
    expect(weeks[0]?.previous.kcal).toBe(1800);
  });

  it('pågående vecka räknas inte och utan data blir listan tom', () => {
    expect(pastWeeks(empty(), '2026-09-30')).toEqual([]);
    const current = { ...empty(), foodLog: [food('2026-09-29', 2000, 80)] };
    expect(pastWeeks(current, '2026-09-30')).toEqual([]);
  });

  it('begränsas till maxWeeks', () => {
    const foodLog = Array.from({ length: 10 }, (_, i) => food(addDays(MON, -7 * i), 2000, 80));
    expect(pastWeeks({ ...empty(), foodLog }, '2026-09-21')).toHaveLength(10);
    expect(pastWeeks({ ...empty(), foodLog }, '2026-09-21', 3)).toHaveLength(3);
  });
});

function summary(overrides: Partial<WeekSummary>): WeekSummary {
  return { ...summarizeWeek(empty(), MON), ...overrides };
}

describe('presentation', () => {
  it('jämför med tolerans och saknade värden', () => {
    expect(compareValues(1800, 1700, 10)).toBe('up');
    expect(compareValues(1700, 1800, 10)).toBe('down');
    expect(compareValues(1805, 1800, 10)).toBe('same');
    expect(compareValues(null, 1800, 10)).toBeNull();
    expect(compareValues(1800, null, 10)).toBeNull();
  });

  it('rubriken är uppmuntrande mot målet och neutral vid uppgång', () => {
    expect(weekHeadline(summary({ trendChangeKg: -0.4 }), profile)).toBe(
      'Trenden rörde sig 0,4 kg mot målet. Fint jobbat!',
    );
    expect(weekHeadline(summary({ trendChangeKg: 0.3 }), profile)).toMatch(
      /^Trenden planade ut, det händer\./,
    );
    expect(weekHeadline(summary({ trendChangeKg: 0.02 }), profile)).toMatch(/stabil/);
    expect(weekHeadline(summary({ trendChangeKg: null }), profile)).toMatch(/Ingen vägning/);
    // Mål att gå upp i vikt: uppgång är mot målet.
    const gain = { startWeightKg: 60, goalWeightKg: 65 };
    expect(weekHeadline(summary({ trendChangeKg: 0.3 }), gain)).toMatch(/mot målet/);
  });

  it('aldrig skuldbeläggande ord', () => {
    const texts = [-1, -0.2, 0, 0.2, 1, null].map((c) =>
      weekHeadline(summary({ trendChangeKg: c }), profile),
    );
    texts.push(
      weekLoggedText(summary({ loggedDays: 0 })),
      weekLoggedText(summary({ loggedDays: 7 })),
    );
    for (const t of texts) expect(t).not.toMatch(/misslyck|dålig|tyvärr|borde|fel/i);
  });

  it('rader: text med mål och bara loggade värden', () => {
    const s = summary({
      trendChangeKg: -0.36,
      kcal: 1812.4,
      foodDays: 5,
      targetKcal: 1900,
      proteinG: 101.6,
      proteinGoalG: 128,
      waterMl: 2100,
      waterDays: 1,
      waterGoalMl: 2800,
      workoutsDone: 3,
      steps: null,
    });
    const text = Object.fromEntries(WEEK_ROWS.map((r) => [r.id, r.text(s)]));
    expect(text).toEqual({
      trend: '−0,4 kg',
      kcal: '1 812 kcal (mål 1 900 kcal) · 5 dagar',
      protein: '102 g (mål 128 g)',
      vatten: '2 100 ml (mål 2 800 ml) · 1 dag',
      traning: '3',
      steg: null,
    });
    expect(WEEK_ROWS.filter((r) => r.feature).map((r) => r.feature)).toEqual([
      'mat',
      'mat',
      'vatten',
      'traning',
      'steg',
    ]);
  });

  it('titel med veckonummer', () => {
    expect(weekTitle(summary({}))).toMatch(/^Vecka 38 · 14 sep\.?–20 sep\.?$/);
  });
});
