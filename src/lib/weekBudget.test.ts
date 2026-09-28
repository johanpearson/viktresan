import { describe, expect, it } from 'vitest';
import { dayTarget, weekBudget } from './weekBudget.ts';

// 2026-09-21 är en måndag. Dagsmål 2 000 kcal → veckobudget 14 000 kcal.
const MON = '2026-09-21';
const WED = '2026-09-23';
const SUN = '2026-09-27';
const base = { dailyTargetKcal: 2000, floorKcal: 1500 };

describe('weekBudget', () => {
  it('måndag: hela budgeten kvar, förslaget = dagsmålet', () => {
    const w = weekBudget({ ...base, intake: [], today: MON });
    expect(w.from).toBe(MON);
    expect(w.to).toBe(SUN);
    expect(w.budgetKcal).toBe(14_000);
    expect(w.daysLeft).toBe(7);
    expect(w.suggestedKcal).toBe(2000);
    expect(w.remainingKcal).toBe(14_000);
    expect(w.shortfall).toBeNull();
  });

  it('fördelar det som är kvar på dagarna som är kvar', () => {
    // Mån 2 500 + tis 2 700 = 5 200. Kvar 8 800 på 5 dagar (ons–sön) = 1 760.
    const intake = [
      { date: MON, kcal: 2500 },
      { date: '2026-09-22', kcal: 2700 },
      { date: WED, kcal: 600 },
    ];
    const w = weekBudget({ ...base, intake, today: WED });
    expect(w.daysLeft).toBe(5);
    expect(w.suggestedKcal).toBe(1760);
    // Kvar för veckan räknar med det som ätits idag.
    expect(w.eatenKcal).toBe(5800);
    expect(w.remainingKcal).toBe(8200);
    expect(w.shortfall).toBeNull();
  });

  it('förslaget står still under dagen (räknas på dagarna före idag)', () => {
    const before = weekBudget({ ...base, intake: [{ date: MON, kcal: 1500 }], today: WED });
    const after = weekBudget({
      ...base,
      intake: [
        { date: MON, kcal: 1500 },
        { date: WED, kcal: 1900 },
      ],
      today: WED,
    });
    expect(after.suggestedKcal).toBe(before.suggestedKcal);
  });

  it('mindre ätet tidigare ger högre förslag', () => {
    const intake = [
      { date: MON, kcal: 1500 },
      { date: '2026-09-22', kcal: 1500 },
    ];
    // Kvar 11 000 på 5 dagar = 2 200.
    expect(weekBudget({ ...base, intake, today: WED }).suggestedKcal).toBe(2200);
  });

  it('dagar utan matlogg räknas som dagsmålet', () => {
    const w = weekBudget({ ...base, intake: [{ date: MON, kcal: 3000 }], today: WED });
    expect(w.assumedDays).toBe(1);
    expect(w.assumedKcal).toBe(2000);
    // 14 000 − 3 000 − 2 000 = 9 000 på 5 dagar.
    expect(w.suggestedKcal).toBe(1800);
  });

  it('golvspärren: förslaget går aldrig under golvet och resten föreslås till nästa vecka', () => {
    // Mån–lör 2 200/dag = 13 200. Kvar 800 för söndagen – under golvet 1 500.
    const intake = Array.from({ length: 6 }, (_, i) => ({
      date: `2026-09-2${String(1 + i)}`,
      kcal: 2200,
    }));
    const w = weekBudget({ ...base, intake, today: SUN });
    expect(w.daysLeft).toBe(1);
    expect(w.suggestedKcal).toBe(1500);
    expect(w.shortfall).toEqual({ perDayKcal: 800, carryKcal: 700, nextWeekPerDayKcal: 100 });
  });

  it('golvspärren även när budgeten redan är slut', () => {
    const intake = [
      { date: MON, kcal: 7000 },
      { date: '2026-09-22', kcal: 7000 },
    ];
    const w = weekBudget({ ...base, intake, today: WED });
    expect(w.suggestedKcal).toBe(1500);
    expect(w.shortfall?.carryKcal).toBe(7500);
    expect(w.shortfall?.nextWeekPerDayKcal).toBe(1071);
    expect(w.remainingKcal).toBe(0);
  });

  it('veckobyte: en ny vecka börjar om, oavsett förra veckan', () => {
    const intake = [
      { date: '2026-09-26', kcal: 4000 },
      { date: SUN, kcal: 4000 },
    ];
    const sunday = weekBudget({ ...base, intake, today: SUN });
    expect(sunday.from).toBe(MON);
    expect(sunday.eatenKcal).toBe(8000);
    const monday = weekBudget({ ...base, intake, today: '2026-09-28' });
    expect(monday.from).toBe('2026-09-28');
    expect(monday.to).toBe('2026-10-04');
    expect(monday.eatenKcal).toBe(0);
    expect(monday.assumedDays).toBe(0);
    expect(monday.suggestedKcal).toBe(2000);
    expect(monday.shortfall).toBeNull();
  });
});

describe('dayTarget', () => {
  const plan = { targetKcal: 2000, floorKcal: 1500 };

  it('per dag (standard): dagsmålet, ingen vecka', () => {
    expect(dayTarget(undefined, plan, [], WED)).toEqual({ targetKcal: 2000, week: null });
    expect(dayTarget('dag', plan, [{ date: MON, kcal: 5000 }], WED).targetKcal).toBe(2000);
  });

  it('per vecka: dagens förslag', () => {
    const result = dayTarget('vecka', plan, [{ date: MON, kcal: 3000 }], '2026-09-22');
    // 14 000 − 3 000 = 11 000 på 6 dagar.
    expect(result.targetKcal).toBe(1833);
    expect(result.week?.budgetKcal).toBe(14_000);
  });

  it('utan kalorimål: inget mål', () => {
    expect(dayTarget('vecka', null, [], WED)).toEqual({ targetKcal: null, week: null });
  });
});
