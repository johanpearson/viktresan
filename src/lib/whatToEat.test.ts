import { describe, expect, it } from 'vitest';
import type { FoodLogEntry } from '../db/db.ts';
import { buildAiPrompt, DEFAULT_AI_OPTIONS, type AiContext } from './aiPrompt.ts';
import {
  GAP_SHARE,
  HOME_FOODS,
  commonFoods,
  gapClaims,
  gapText,
  largeGaps,
  typicalMealKcal,
  whatToEatSubject,
  type Goals,
} from './whatToEat.ts';

const TODAY = '2026-10-01';
const GOALS: Goals = { targetKcal: 2000, proteinGoalG: 120, fiberGoalG: 30 };

let seq = 0;
function entry(over: Partial<FoodLogEntry> & Pick<FoodLogEntry, 'date'>): FoodLogEntry {
  seq += 1;
  return {
    id: `e${String(seq)}`,
    meal: 'lunch',
    foodId: 'lv:1',
    name: 'Kycklingfilé',
    amount: 100,
    unit: 'g',
    grams: 100,
    per100: { kcal: 100, proteinG: 20, carbsG: 0, fatG: 2 },
    createdAt: seq,
    ...over,
  };
}

describe('gapraden', () => {
  it('visar protein och fiber med mer än 10 % kvar, störst andel först', () => {
    // Protein: 79 av 120 → 41 g (34 %). Fiber: 24 av 30 → 6 g (20 %).
    const gaps = largeGaps({ kcal: 1200, proteinG: 79, fiberG: 24 }, GOALS);
    expect(gaps.map((g) => g.nutrient)).toEqual(['protein', 'fiber']);
    expect(gapText(gaps)).toBe('41 g protein och 6 g fiber kvar');
  });

  it('störst andel först även när fibern har minst gram kvar', () => {
    // Protein 100 av 120 → 17 %; fiber 10 av 30 → 67 %.
    const gaps = largeGaps({ kcal: 1200, proteinG: 100, fiberG: 10 }, GOALS);
    expect(gapText(gaps)).toBe('20 g fiber och 20 g protein kvar');
  });

  it('tröskeln: exakt 10 % kvar räknas som inom målet, strax över visas', () => {
    expect(GAP_SHARE).toBe(0.1);
    // 108 av 120 = exakt 12 g = 10 % kvar.
    const at = largeGaps({ kcal: 0, proteinG: 108, fiberG: 27 }, GOALS);
    expect(at).toEqual([]);
    expect(gapText(at)).toBeNull();
    // 107 av 120 = 13 g ≈ 10,8 % kvar.
    const over = largeGaps({ kcal: 0, proteinG: 107, fiberG: 27 }, GOALS);
    expect(gapText(over)).toBe('13 g protein kvar');
  });

  it('visas inte när allt är inom 10 %, inte heller över målet', () => {
    expect(gapText(largeGaps({ kcal: 0, proteinG: 130, fiberG: 28 }, GOALS))).toBeNull();
  });

  it('ett mål som saknas – eller fiber som inte är inläst – ger inget gap', () => {
    const gaps = largeGaps(
      { kcal: 0, proteinG: 0, fiberG: null },
      { targetKcal: null, proteinGoalG: null, fiberGoalG: 30 },
    );
    expect(gaps).toEqual([]);
  });

  it('stora gap ger etiketterna som sök-sheeten visar först', () => {
    const gaps = largeGaps({ kcal: 0, proteinG: 100, fiberG: 10 }, GOALS);
    expect(gapClaims(gaps)).toEqual(['fiberrik', 'proteinrik']);
    expect(gapClaims([])).toEqual([]);
  });
});

describe('typicalMealKcal', () => {
  it('medianen av måltidens summa per dag de senaste 28 dagarna', () => {
    const log = [
      entry({ date: '2026-09-30', grams: 400 }),
      entry({ date: '2026-09-29', grams: 500 }),
      entry({ date: '2026-09-29', grams: 100 }),
      entry({ date: '2026-09-28', grams: 300 }),
      entry({ date: '2026-09-28', meal: 'middag', grams: 900 }),
      // Utanför fönstret, idag och snabbloggar räknas inte.
      entry({ date: '2026-08-01', grams: 2000 }),
      entry({ date: TODAY, grams: 2000 }),
      entry({ date: '2026-09-27', grams: 2000, estimated: true, foodId: 'snabb:x:2000:0' }),
    ];
    expect(typicalMealKcal(log, 'lunch', TODAY)).toBe(400);
  });

  it('färre än tre dagar → null', () => {
    const log = [entry({ date: '2026-09-30' }), entry({ date: '2026-09-29' })];
    expect(typicalMealKcal(log, 'lunch', TODAY)).toBeNull();
  });
});

describe('commonFoods', () => {
  it('de vanligaste livsmedlen, högst 20, utan måltider och recept', () => {
    const log: FoodLogEntry[] = [];
    for (let i = 0; i < 25; i++) {
      for (let n = 0; n <= i; n++) {
        log.push(
          entry({ date: '2026-09-20', foodId: `lv:${String(i)}`, name: `Mat ${String(i)}` }),
        );
      }
    }
    log.push(entry({ date: '2026-09-20', foodId: 'maltid:a', name: 'Min frukost' }));
    log.push(entry({ date: '2026-09-20', foodId: 'maltid:a', name: 'Min frukost' }));
    const foods = commonFoods(log, TODAY);
    expect(HOME_FOODS).toBe(20);
    expect(foods).toHaveLength(20);
    expect(foods[0]).toBe('Mat 24');
    expect(foods).not.toContain('Min frukost');
    expect(foods).not.toContain('Mat 0');
  });
});

describe('whatToEatSubject → prompt', () => {
  const context: AiContext = {
    age: 45,
    sex: 'man',
    heightCm: 180,
    trendKg: 90,
    goalWeightKg: 80,
    ratePerWeekKg: 0.5,
    targetKcal: 2000,
    proteinGoalG: 120,
    floorKcal: { man: 1500, kvinna: 1200, unknown: 1200 },
    dayIntake: null,
    foodPreferences: 'Vegetarian',
    glp1: null,
  };

  it('bygger prompten med måltid, kvarvarande kcal/protein/fiber, typisk portion och vanliga livsmedel', () => {
    const log = [
      entry({ date: '2026-09-30', meal: 'middag', grams: 600, name: 'Linser', foodId: 'lv:5' }),
      entry({ date: '2026-09-29', meal: 'middag', grams: 600, name: 'Linser', foodId: 'lv:5' }),
      entry({ date: '2026-09-28', meal: 'middag', grams: 600, name: 'Tofu', foodId: 'lv:6' }),
    ];
    const subject = whatToEatSubject({
      meal: 'middag',
      today: TODAY,
      log,
      eaten: { kcal: 1400, proteinG: 80, fiberG: 18 },
      goals: GOALS,
    });
    const prompt = buildAiPrompt(subject, context, DEFAULT_AI_OPTIONS);
    expect(prompt).toContain('vad jag ska äta till middag idag');
    expect(prompt).toContain('Måltid: Middag, min typiska portion är ca 600 kcal.');
    expect(prompt).toContain('Kvar av dagens mål: 600 kcal, 40 g protein, 12 g fiber.');
    expect(prompt).toContain('Det här brukar finnas hemma: Linser, Tofu.');
    expect(prompt).toContain('Mina matpreferenser: Vegetarian');
  });

  it('fiber som inte är inläst utelämnas ur det som är kvar', () => {
    const subject = whatToEatSubject({
      meal: 'frukost',
      today: TODAY,
      log: [],
      eaten: { kcal: 0, proteinG: 0, fiberG: null },
      goals: GOALS,
    });
    expect(subject).toMatchObject({ remaining: { kcal: 2000, proteinG: 120, fiberG: null } });
  });
});
