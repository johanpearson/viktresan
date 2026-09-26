import { describe, expect, it } from 'vitest';
import { addDays } from './dates.ts';
import {
  CELEBRATE_WITHIN_DAYS,
  describeMilestone,
  diffMilestones,
  evaluateMilestones,
  milestoneMessage,
  milestoneMessages,
  reachedMilestones,
  upcomingMilestones,
  type Milestone,
  type MilestoneCandidate,
  type MilestoneInput,
} from './milestones.ts';

const START = '2026-01-01';
const TODAY = '2026-09-26';

const profile = { startWeightKg: 100, heightCm: 180, goalWeightKg: 80 };

function input(patch: Partial<MilestoneInput> = {}): MilestoneInput {
  return {
    profile,
    weights: [],
    waist: [],
    steps: [],
    foodLog: [],
    water: [],
    workouts: [],
    photoDates: [],
    ...patch,
  };
}

/** En vägning per dag från `from`, som går från `fromKg` med `perDay` kg per dag. */
function series(from: string, days: number, fromKg: number, perDay: number) {
  return Array.from({ length: days }, (_, i) => ({
    date: addDays(from, i),
    weightKg: fromKg + perDay * i,
  }));
}

function known(id: string): Milestone {
  const milestone = describeMilestone(id);
  if (!milestone) throw new Error(`okänd ${id}`);
  return milestone;
}

function candidate(list: readonly MilestoneCandidate[], id: string): MilestoneCandidate {
  const found = list.find((c) => c.milestone.id === id);
  if (!found) throw new Error(`saknar ${id}`);
  return found;
}

function dateOf(data: MilestoneInput, id: string, today = TODAY): string | null {
  return candidate(evaluateMilestones(data, today), id).date;
}

describe('describeMilestone', () => {
  it('känner igen alla milstolpar och avvisar okända id:n', () => {
    for (const id of [
      'kg-1',
      'kg-5',
      'kg-35',
      'procent-5',
      'procent-10',
      'bmi-overvikt',
      'bmi-normalvikt',
      'halvvags-80',
      'mal-72.5',
      'dagar-7',
      'dagar-30',
      'dagar-100',
      'pass-1',
      'pass-10',
      'pass-50',
      'vatten-7',
      'protein-7',
      'bild-1',
      'bild-30',
    ]) {
      expect(describeMilestone(id)?.id).toBe(id);
    }
    for (const id of ['kg-3', 'procent-7', 'bmi-undervikt', 'dagar-8', 'annat-1', 'kg', '']) {
      expect(describeMilestone(id)).toBeNull();
    }
  });

  it('5 kg-steg, 10 %, halvvägs och mål nått är stora – övriga små', () => {
    const big = ['kg-5', 'kg-10', 'procent-10', 'halvvags-80', 'mal-80'];
    const small = ['kg-1', 'procent-5', 'bmi-overvikt', 'dagar-7', 'pass-1', 'bild-30'];
    for (const id of big) expect(describeMilestone(id)?.size).toBe('stor');
    for (const id of small) expect(describeMilestone(id)?.size).toBe('liten');
  });

  it('funktionsmilstolpar hör till sin funktion', () => {
    expect(describeMilestone('pass-10')?.feature).toBe('traning');
    expect(describeMilestone('vatten-7')?.feature).toBe('vatten');
    expect(describeMilestone('protein-7')?.feature).toBe('mat');
    expect(describeMilestone('bild-1')?.feature).toBe('bilder');
    expect(describeMilestone('kg-5')?.feature).toBeUndefined();
  });
});

describe('viktmilstolpar (trendvikt)', () => {
  it('första kilot nås när trenden – inte dagsvikten – är ett kilo under start', () => {
    // Dagsvikten dippar 2 kg en dag och går sedan tillbaka: trenden rör sig bara 0,2 kg.
    const dip = input({
      weights: [
        { date: START, weightKg: 100 },
        { date: addDays(START, 1), weightKg: 98 },
        { date: addDays(START, 2), weightKg: 100 },
      ],
    });
    expect(dateOf(dip, 'kg-1')).toBeNull();

    // Stadig nedgång 0,1 kg/dag: trenden släpar efter dagsvikten.
    const steady = input({ weights: series(START, 40, 100, -0.1) });
    const date = dateOf(steady, 'kg-1');
    expect(date).not.toBeNull();
    // Dagsvikten passerade 99 kg dag 10, trenden först senare.
    expect(date && date > addDays(START, 10)).toBe(true);
  });

  it('var 5:e kg: 5 och 10 kg nås i ordning, bara nästa steg finns bland kommande', () => {
    const data = input({ weights: series(START, 200, 100, -0.06) });
    const list = evaluateMilestones(data, TODAY);
    const five = candidate(list, 'kg-5').date;
    const ten = candidate(list, 'kg-10').date;
    expect(five).not.toBeNull();
    expect(ten).not.toBeNull();
    expect(five && ten && five < ten).toBe(true);
    // 15 kg (85 kg) är nästa steg; 20 kg och längre finns inte med ännu.
    expect(list.filter((c) => c.milestone.id.startsWith('kg-')).map((c) => c.milestone.id)).toEqual(
      ['kg-1', 'kg-5', 'kg-10', 'kg-15'],
    );
    expect(candidate(list, 'kg-15')).toMatchObject({ date: null, upcoming: true });

    // Ett steg under målvikten visas inte som kommande.
    const nearGoal = evaluateMilestones(
      input({ profile: { ...profile, goalWeightKg: 88 }, weights: data.weights }),
      TODAY,
    );
    expect(candidate(nearGoal, 'kg-15')).toMatchObject({ date: null, upcoming: false });
  });

  it('5 % och 10 % av startvikten', () => {
    const data = input({ weights: series(START, 60, 94, -0.1) });
    const list = evaluateMilestones(data, TODAY);
    expect(candidate(list, 'procent-5').date).toBe(START);
    // 10 % = 90 kg: dagsvikten når dit dag 40, trenden några dagar senare.
    const ten = candidate(list, 'procent-10').date;
    expect(ten && ten > addDays(START, 40)).toBe(true);
  });

  it('ny BMI-kategori: under 30 och under 25, aldrig undervikt', () => {
    // 180 cm: BMI 30 = 97,2 kg, BMI 25 = 81 kg.
    const data = input({ weights: series(START, 10, 97, 0) });
    const list = evaluateMilestones(data, TODAY);
    expect(candidate(list, 'bmi-overvikt').date).toBe(START);
    expect(candidate(list, 'bmi-normalvikt').date).toBeNull();

    // Börjar i normalvikt → inga BMI-milstolpar alls.
    const normal = evaluateMilestones(
      input({ profile: { ...profile, startWeightKg: 75, goalWeightKg: 70 } }),
      TODAY,
    );
    expect(normal.some((c) => c.milestone.id.startsWith('bmi-'))).toBe(false);
  });

  it('halvvägs och mål nått gäller målvikten, inte vid mål över startvikten', () => {
    const data = input({ weights: series(START, 10, 79, 0) });
    const list = evaluateMilestones(data, TODAY);
    expect(candidate(list, 'halvvags-80').date).toBe(START);
    expect(candidate(list, 'mal-80')).toMatchObject({ date: START });
    expect(candidate(list, 'mal-80').milestone.action).toBe('nytt-mal');

    const gaining = evaluateMilestones(
      input({ profile: { ...profile, goalWeightKg: 105 } }),
      TODAY,
    );
    expect(gaining.some((c) => /^(halvvags|mal)-/.test(c.milestone.id))).toBe(false);
  });

  it('ett nytt mål ger en ny mål-milstolpe', () => {
    const data = input({
      profile: { ...profile, goalWeightKg: 72.5 },
      weights: series(START, 10, 79, 0),
    });
    const list = evaluateMilestones(data, TODAY);
    expect(candidate(list, 'mal-72.5').date).toBeNull();
    expect(list.some((c) => c.milestone.id === 'mal-80')).toBe(false);
  });

  it('räknar inte vägningar efter idag', () => {
    const data = input({ weights: [{ date: addDays(TODAY, 1), weightKg: 70 }] });
    expect(dateOf(data, 'mal-80')).toBeNull();
  });

  it('kräver profil', () => {
    const list = evaluateMilestones(
      input({ profile: null, weights: series(START, 5, 70, 0) }),
      TODAY,
    );
    expect(list.some((c) => c.milestone.group === 'vikt')).toBe(false);
  });
});

describe('vanemilstolpar', () => {
  it('loggade dagar räknas totalt (inte i rad) över alla loggtyper, en gång per dag', () => {
    const days = [0, 3, 9, 20, 21, 40, 70].map((d) => addDays(START, d));
    const data = input({
      weights: [{ date: days[0] ?? '', weightKg: 100 }],
      water: [
        { date: days[0] ?? '', ml: 250 },
        { date: days[1] ?? '', ml: 250 },
      ],
      steps: [{ date: days[2] ?? '' }],
      waist: [{ date: days[3] ?? '' }],
      foodLog: [
        { date: days[4] ?? '', grams: 100, per100: { kcal: 1, proteinG: 0, carbsG: 0, fatG: 0 } },
      ],
      workouts: [
        { date: days[5] ?? '', status: 'genomford' },
        // Planerade och hoppade pass är ingen loggning.
        { date: addDays(START, 50), status: 'planerad' },
        { date: addDays(START, 51), status: 'hoppad' },
      ],
    });
    expect(dateOf(data, 'dagar-7')).toBeNull();
    const withOneMore = {
      ...data,
      weights: [...data.weights, { date: days[6] ?? '', weightKg: 99 }],
    };
    expect(dateOf(withOneMore, 'dagar-7')).toBe(days[6]);
    expect(candidate(evaluateMilestones(withOneMore, TODAY), 'dagar-30')).toMatchObject({
      date: null,
      remaining: '23 dagar kvar',
    });
  });

  it('första passet, 10 och 50 pass räknar bara genomförda', () => {
    const done = Array.from({ length: 10 }, (_, i) => ({
      date: addDays(START, i * 3),
      status: 'genomford',
    }));
    const data = input({ workouts: [{ date: START, status: 'hoppad' }, ...done] });
    const list = evaluateMilestones(data, TODAY);
    expect(candidate(list, 'pass-1').date).toBe(START);
    expect(candidate(list, 'pass-10').date).toBe(addDays(START, 27));
    expect(candidate(list, 'pass-50')).toMatchObject({ date: null, remaining: '40 pass kvar' });
  });

  it('vattenmålet nått 7 dagar totalt', () => {
    const data = input({
      profile: { ...profile, waterGoalMl: 2000 },
      water: [
        ...[0, 2, 4, 6, 8, 10].map((d) => ({ date: addDays(START, d), ml: 2000 })),
        // Under målet räknas inte.
        { date: addDays(START, 11), ml: 1900 },
        // Flera poster samma dag summeras.
        { date: addDays(START, 12), ml: 1000 },
        { date: addDays(START, 12), ml: 1000 },
      ],
    });
    expect(dateOf(data, 'vatten-7')).toBe(addDays(START, 12));
  });

  it('vattenmålet utan eget mål följer trendvikten den dagen', () => {
    // 100 kg → 3 300 ml.
    const water = Array.from({ length: 7 }, (_, i) => ({ date: addDays(START, i), ml: 3200 }));
    const data = input({ weights: [{ date: START, weightKg: 100 }], water });
    expect(dateOf(data, 'vatten-7')).toBeNull();
    expect(dateOf({ ...data, weights: [{ date: START, weightKg: 96 }] }, 'vatten-7')).toBe(
      addDays(START, 6),
    );
  });

  it('proteinmålet nått 7 dagar totalt (1,6 g × målvikt)', () => {
    // Mål: 1,6 × 80 = 128 g. 700 g × 20 g/100 g = 140 g.
    const per100 = { kcal: 150, proteinG: 20, carbsG: 0, fatG: 5 };
    const foodLog = [0, 1, 2, 5, 6, 8, 13].map((d) => ({
      date: addDays(START, d),
      grams: 700,
      per100,
    }));
    const low = { date: addDays(START, 3), grams: 100, per100 };
    const data = input({ foodLog: [...foodLog, low] });
    expect(dateOf(data, 'protein-7')).toBe(addDays(START, 13));
    const factor = input({ profile: { ...profile, proteinFactor: 2.0 }, foodLog });
    expect(dateOf(factor, 'protein-7')).toBeNull();
  });
});

describe('bildmilstolpar', () => {
  it('första bilden och första bilden minst 30 dagar efter den', () => {
    const photoDates = [START, addDays(START, 10), addDays(START, 29), addDays(START, 31)];
    const list = evaluateMilestones(input({ photoDates }), TODAY);
    expect(candidate(list, 'bild-1').date).toBe(START);
    expect(candidate(list, 'bild-30').date).toBe(addDays(START, 31));
    expect(candidate(list, 'bild-30').milestone.action).toBe('jamfor-bilder');
  });

  it('säger hur länge det är kvar till jämförelsebilden', () => {
    const list = evaluateMilestones(input({ photoDates: [addDays(TODAY, -20)] }), TODAY);
    expect(candidate(list, 'bild-30')).toMatchObject({
      date: null,
      remaining: 'Ta en ny bild om 10 dagar',
    });
  });
});

describe('upcomingMilestones', () => {
  it('ger de tre närmaste som inte nåtts eller sparats, mest avklarat först', () => {
    const data = input({
      weights: series(addDays(TODAY, -30), 31, 100, -0.02),
      workouts: Array.from({ length: 8 }, (_, i) => ({
        date: addDays(TODAY, -i),
        status: 'genomford',
      })),
    });
    const list = evaluateMilestones(data, TODAY);
    const upcoming = upcomingMilestones(list, new Set(['pass-1']));
    expect(upcoming).toHaveLength(3);
    // 8 av 10 pass, trenden ~0,4 kg ner, 31 av 100 loggade dagar.
    expect(upcoming.map((c) => c.milestone.id)).toEqual(['pass-10', 'kg-1', 'dagar-100']);
    for (const c of upcoming) expect(c.date).toBeNull();
    expect(upcomingMilestones(list, new Set(['pass-10']))[0]?.milestone.id).toBe('kg-1');
  });
});

describe('diffMilestones', () => {
  const data = input({ weights: series(addDays(TODAY, -2), 3, 94, 0) });
  const reached = reachedMilestones(evaluateMilestones(data, TODAY));

  it('silent sparar allt nått utan att fira', () => {
    const diff = diffMilestones(reached, new Set(), { mode: 'silent', today: TODAY });
    expect(diff.added.map((r) => r.milestone.id).sort()).toEqual([
      'bmi-overvikt',
      'kg-1',
      'kg-5',
      'procent-5',
    ]);
    expect(diff.celebrate).toEqual([]);
  });

  it('live firar nyss nådda, viktigast först, och aldrig en redan sparad', () => {
    const diff = diffMilestones(reached, new Set(['kg-1']), { mode: 'live', today: TODAY });
    expect(diff.celebrate.map((r) => r.milestone.id)).toEqual([
      'kg-5',
      'bmi-overvikt',
      'procent-5',
    ]);
    expect(diff.added.some((r) => r.milestone.id === 'kg-1')).toBe(false);
  });

  it('live firar inte milstolpar som nåddes för länge sedan (t.ex. inlagda i efterhand)', () => {
    const old = [{ milestone: known('kg-5'), date: addDays(TODAY, -CELEBRATE_WITHIN_DAYS) }];
    const diff = diffMilestones(old, new Set(), { mode: 'live', today: TODAY });
    expect(diff.added).toHaveLength(1);
    expect(diff.celebrate).toEqual([]);
  });

  it('live firar inte milstolpar för avstängda funktioner men sparar dem', () => {
    const first = reachedMilestones(
      evaluateMilestones(input({ workouts: [{ date: TODAY, status: 'genomford' }] }), TODAY),
    );
    const diff = diffMilestones(first, new Set(), {
      mode: 'live',
      today: TODAY,
      isEnabled: (m) => m.feature !== 'traning',
    });
    expect(diff.added.map((r) => r.milestone.id)).toEqual(['pass-1']);
    expect(diff.celebrate).toEqual([]);
  });
});

describe('meddelanden', () => {
  it('har flera varianter per milstolpe', () => {
    for (const id of ['kg-1', 'kg-5', 'kg-20', 'procent-5', 'procent-10', 'bmi-overvikt']) {
      expect(milestoneMessages(known(id)).length).toBeGreaterThanOrEqual(2);
    }
    for (const id of ['halvvags-80', 'mal-80', 'dagar-7', 'dagar-30', 'dagar-100', 'pass-1']) {
      expect(milestoneMessages(known(id)).length).toBeGreaterThanOrEqual(2);
    }
    for (const id of ['pass-10', 'pass-50', 'vatten-7', 'protein-7', 'bild-1', 'bild-30']) {
      expect(milestoneMessages(known(id)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('kopplar kilona till något konkret', () => {
    const five = milestoneMessages(known('kg-5'));
    expect(five.every((m) => m.includes('smör'))).toBe(true);
    expect(milestoneMessages(known('kg-20'))[0]).toContain('20 literpaket mjölk');
  });

  it('väljer samma text för samma milstolpe och dag', () => {
    const m = known('kg-5');
    expect(milestoneMessage(m, TODAY)).toBe(milestoneMessage(m, TODAY));
    expect(milestoneMessages(m)).toContain(milestoneMessage(m, TODAY));
  });
});
