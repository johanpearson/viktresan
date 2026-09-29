import { describe, expect, it } from 'vitest';
import { weekBudget, weekRowShortText } from './weekBudget.ts';

// 2026-09-21 är en måndag. Dagsmål 2 000 kcal → veckobudget 14 000 kcal.
const MON = '2026-09-21';
const TUE = '2026-09-22';
const WED = '2026-09-23';
const SUN = '2026-09-27';
const NEXT_MON = '2026-09-28';
const base = { dailyTargetKcal: 2000, floorKcal: 1500 };

describe('weekBudget', () => {
  it('måndag: hela budgeten kvar, per dag = dagsmålet, saldo 0', () => {
    const w = weekBudget({ ...base, intake: [], today: MON });
    expect(w.from).toBe(MON);
    expect(w.to).toBe(SUN);
    expect(w.budgetKcal).toBe(14_000);
    expect(w.daysLeft).toBe(7);
    expect(w.perDayKcal).toBe(2000);
    expect(w.remainingKcal).toBe(14_000);
    expect(w.balanceKcal).toBe(0);
    expect(w.shortfall).toBeNull();
  });

  it('mitt i veckan: kvar och per dag resten av veckan (idag medräknad)', () => {
    // Mån 2 500 + tis 2 700 = 5 200. Kvar 8 800 på 5 dagar (ons–sön) = 1 760.
    const intake = [
      { date: MON, kcal: 2500 },
      { date: TUE, kcal: 2700 },
      { date: WED, kcal: 600 },
    ];
    const w = weekBudget({ ...base, intake, today: WED });
    expect(w.daysLeft).toBe(5);
    expect(w.perDayKcal).toBe(1760);
    // Kvar för veckan räknar med det som ätits idag.
    expect(w.eatenKcal).toBe(5800);
    expect(w.remainingKcal).toBe(8200);
    // Saldo: 5 200 − 2 × 2 000 = +1 200 (dagarna före idag).
    expect(w.balanceKcal).toBe(1200);
    expect(w.shortfall).toBeNull();
  });

  it('per dag står still under dagen (räknas på dagarna före idag)', () => {
    const before = weekBudget({ ...base, intake: [{ date: MON, kcal: 1500 }], today: WED });
    const after = weekBudget({
      ...base,
      intake: [
        { date: MON, kcal: 1500 },
        { date: WED, kcal: 1900 },
      ],
      today: WED,
    });
    expect(after.perDayKcal).toBe(before.perDayKcal);
    expect(after.balanceKcal).toBe(before.balanceKcal);
  });

  it('dagar utan matlogg räknas som 0 kcal men markeras som ej loggade', () => {
    // Bara måndag loggad; tisdag saknas → 0 kcal.
    const w = weekBudget({ ...base, intake: [{ date: MON, kcal: 2000 }], today: WED });
    expect(w.unloggedDays).toBe(1);
    expect(w.eatenKcal).toBe(2000);
    // Kvar 12 000 på 5 dagar = 2 400.
    expect(w.perDayKcal).toBe(2400);
    // Saldo: 2 000 − 4 000 = −2 000.
    expect(w.balanceKcal).toBe(-2000);
    expect(w.days.map((d) => [d.kcal, d.status])).toEqual([
      [2000, 'past'],
      [null, 'past'],
      [null, 'today'],
      [null, 'future'],
      [null, 'future'],
      [null, 'future'],
      [null, 'future'],
    ]);
  });

  it('veckobyte: måndag börjar en ny vecka med hela budgeten', () => {
    const intake = [
      { date: MON, kcal: 3000 },
      { date: SUN, kcal: 3000 },
      { date: NEXT_MON, kcal: 800 },
    ];
    const sunday = weekBudget({ ...base, intake, today: SUN });
    expect(sunday.daysLeft).toBe(1);
    expect(sunday.from).toBe(MON);
    const monday = weekBudget({ ...base, intake, today: NEXT_MON });
    expect(monday.from).toBe(NEXT_MON);
    expect(monday.to).toBe('2026-10-04');
    expect(monday.daysLeft).toBe(7);
    expect(monday.perDayKcal).toBe(2000);
    expect(monday.eatenKcal).toBe(800);
    expect(monday.balanceKcal).toBe(0);
  });

  it('avslutad vecka: inget per dag-förslag, saldo för hela veckan', () => {
    const intake = [
      { date: MON, kcal: 2100 },
      { date: TUE, kcal: 1900 },
      { date: WED, kcal: 2500 },
    ];
    const w = weekBudget({ ...base, intake, today: NEXT_MON, weekOf: WED });
    expect(w.from).toBe(MON);
    expect(w.daysLeft).toBe(0);
    expect(w.perDayKcal).toBeNull();
    expect(w.eatenKcal).toBe(6500);
    expect(w.balanceKcal).toBe(6500 - 14_000);
    expect(w.unloggedDays).toBe(4);
    expect(w.shortfall).toBeNull();
  });

  describe('golvspärren', () => {
    it('per dag går aldrig under golvet; resten föreslås till nästa vecka', () => {
      // Mån + tis 5 000 var = 10 000. Kvar 4 000 på 5 dagar = 800 < golvet 1 500.
      const intake = [
        { date: MON, kcal: 5000 },
        { date: TUE, kcal: 5000 },
      ];
      const w = weekBudget({ ...base, intake, today: WED });
      expect(w.perDayKcal).toBe(1500);
      // 10 000 + 5 × 1 500 = 17 500 → 3 500 över, 500 per dag nästa vecka.
      expect(w.shortfall).toEqual({
        exceeded: false,
        exceededKcal: 0,
        overKcal: 3500,
        nextWeekPerDayKcal: 500,
      });
    });

    it('redan överskriden budget sägs som den är', () => {
      const intake = [
        { date: MON, kcal: 8000 },
        { date: TUE, kcal: 7000 },
      ];
      const w = weekBudget({ ...base, intake, today: WED });
      expect(w.remainingKcal).toBe(-1000);
      expect(w.perDayKcal).toBe(1500);
      expect(w.shortfall?.exceeded).toBe(true);
      expect(w.shortfall?.exceededKcal).toBe(1000);
      // 15 000 + 5 × 1 500 − 14 000 = 8 500.
      expect(w.shortfall?.overKcal).toBe(8500);
    });

    it('en stor dag idag räknas in i det som går över', () => {
      // Söndag: 12 000 före idag, 3 000 idag → 1 000 över budgeten.
      const intake = [
        { date: MON, kcal: 12_000 },
        { date: SUN, kcal: 3000 },
      ];
      const w = weekBudget({ ...base, intake, today: SUN });
      expect(w.perDayKcal).toBe(1500);
      expect(w.shortfall).toEqual({
        exceeded: true,
        exceededKcal: 1000,
        overKcal: 1000,
        nextWeekPerDayKcal: 143,
      });
    });

    it('precis på budgeten är ingen spärr', () => {
      const intake = [
        { date: MON, kcal: 12_000 },
        { date: SUN, kcal: 2000 },
      ];
      const w = weekBudget({ ...base, intake, today: SUN });
      expect(w.remainingKcal).toBe(0);
      expect(w.shortfall).toBeNull();
      expect(w.perDayKcal).toBe(2000);
    });
  });
});

describe('weekRowShortText', () => {
  it('veckoraden', () => {
    const intake = [
      { date: MON, kcal: 2500 },
      { date: TUE, kcal: 2700 },
      { date: WED, kcal: 600 },
    ];
    const w = weekBudget({ ...base, intake, today: WED });
    expect(weekRowShortText(w)).toBe('Vecka: 8 200 kcal kvar · ≈ 1 760/dag');
  });

  it('över budgeten och avslutad vecka', () => {
    const over = weekBudget({ ...base, intake: [{ date: MON, kcal: 15_000 }], today: WED });
    const done = weekBudget({ ...base, intake: [], today: NEXT_MON, weekOf: WED });
    expect(weekRowShortText(over)).toBe('Vecka: 1 000 kcal över · ≈ 1 500/dag');
    expect(weekRowShortText(done)).toBe('Vecka: 14 000 kcal kvar');
  });
});
