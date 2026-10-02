import { describe, expect, it } from 'vitest';
import {
  applyMealOrder,
  currentMealId,
  defaultMealSlots,
  initialMealId,
  mealName,
  mealSlotError,
  resolveEntryMeals,
  resolveMealId,
  snackFor,
  type MealSlot,
} from './mealSlots.ts';

const SLOTS = defaultMealSlots(1);
/** Lokal tid 2026-09-27 hh:mm. */
const at = (h: number, m = 0) => new Date(2026, 8, 27, h, m);

describe('pågående måltid', () => {
  it('är måltiden vars tid ligger närmast före klockslaget', () => {
    expect(currentMealId(SLOTS, at(7))).toBe('frukost');
    expect(currentMealId(SLOTS, at(9, 59))).toBe('frukost');
    expect(currentMealId(SLOTS, at(10))).toBe('formiddag');
    expect(currentMealId(SLOTS, at(12, 30))).toBe('lunch');
    expect(currentMealId(SLOTS, at(15, 1))).toBe('eftermiddag');
    expect(currentMealId(SLOTS, at(18))).toBe('middag');
    expect(currentMealId(SLOTS, at(23, 30))).toBe('kvall');
  });

  it('före dagens första måltid är det den första', () => {
    expect(currentMealId(SLOTS, at(5))).toBe('frukost');
  });

  it('följer egna tider och borttagna måltider, inte listans ordning', () => {
    const slots: MealSlot[] = [
      { id: 'sen', name: 'Sen middag', time: '20:00', kind: 'huvudmal', order: 0, createdAt: 1 },
      { id: 'tidig', name: 'Tidig lunch', time: '11:00', kind: 'huvudmal', order: 1, createdAt: 1 },
    ];
    expect(currentMealId(slots, at(19))).toBe('tidig');
    expect(currentMealId(slots, at(21))).toBe('sen');
    expect(
      currentMealId(
        SLOTS.filter((s) => s.id !== 'eftermiddag'),
        at(16),
      ),
    ).toBe('lunch');
    expect(currentMealId([], at(12))).toBeNull();
  });

  it('förval i logg-sheeten: postens måltid, vald måltid, annars pågående', () => {
    expect(initialMealId(SLOTS, null, at(21, 15))).toBe('kvall');
    expect(initialMealId(SLOTS, { meal: 'lunch' }, at(21, 15))).toBe('lunch');
    // En post med en borttagen måltid hamnar närmast sin loggtid.
    expect(initialMealId(SLOTS, { meal: 'brunch', createdAt: at(11, 50).getTime() })).toBe('lunch');
  });
});

describe('migrering av Mellanmål', () => {
  it('fördelar på mellanmålet närmast loggtiden', () => {
    expect(snackFor(SLOTS, at(9, 30).getTime())).toBe('formiddag');
    expect(snackFor(SLOTS, at(12).getTime())).toBe('formiddag');
    expect(snackFor(SLOTS, at(13).getTime())).toBe('eftermiddag');
    expect(snackFor(SLOTS, at(19).getTime())).toBe('kvall');
    // Runt dygnet: 02:00 ligger närmare 21:00 (5 h) än 10:00 (8 h).
    expect(snackFor(SLOTS, at(2).getTime())).toBe('kvall');
  });

  it('utan loggtid: Eftermiddagsmellanmål', () => {
    expect(snackFor(SLOTS, Number.NaN)).toBe('eftermiddag');
  });

  it('utan mellanmål: Eftermiddagsmellanmål om det finns, annars närmaste måltid', () => {
    const mains = SLOTS.filter((s) => s.kind === 'huvudmal');
    expect(snackFor(mains, at(17).getTime())).toBe('middag');
  });

  it('Frukost, Lunch och Middag behåller sina id:n', () => {
    for (const id of ['frukost', 'lunch', 'middag']) {
      expect(resolveMealId(SLOTS, id, at(3).getTime())).toBe(id);
    }
    expect(resolveMealId(SLOTS, 'mellanmal', at(21, 30).getTime())).toBe('kvall');
  });

  it('poster med en okänd måltid flyttas, övriga lämnas oförändrade', () => {
    const entries = [
      { id: 'a', meal: 'lunch', createdAt: at(12).getTime() },
      { id: 'b', meal: 'mellanmal', createdAt: at(15).getTime() },
    ];
    const resolved = resolveEntryMeals(entries, SLOTS);
    expect(resolved[0]).toBe(entries[0]);
    expect(resolved[1]).toEqual({ ...entries[1], meal: 'eftermiddag' });
  });
});

describe('inställningen', () => {
  it('ny ordning: order 0, 1, 2 … och updatedAt bara på de som flyttats', () => {
    const next = applyMealOrder(
      SLOTS,
      ['frukost', 'lunch', 'formiddag', 'eftermiddag', 'middag', 'kvall'],
      9,
    );
    expect(next.map((s) => [s.id, s.order, s.updatedAt])).toEqual([
      ['frukost', 0, undefined],
      ['lunch', 1, 9],
      ['formiddag', 2, 9],
      ['eftermiddag', 3, undefined],
      ['middag', 4, undefined],
      ['kvall', 5, undefined],
    ]);
  });

  it('validerar namn och tid', () => {
    expect(mealSlotError({ name: ' ', time: '10:00' }, SLOTS)).toMatch(/namn/);
    expect(mealSlotError({ name: 'lunch', time: '10:00' }, SLOTS)).toMatch(/redan/);
    expect(mealSlotError({ name: 'Brunch', time: '' }, SLOTS)).toMatch(/tid/);
    expect(mealSlotError({ name: 'Brunch', time: '10:30' }, SLOTS)).toBeNull();
  });

  it('namnet på en borttagen måltid', () => {
    expect(mealName(SLOTS, 'kvall')).toBe('Kvällsmål');
    expect(mealName(SLOTS, 'saknas')).toBe('Måltid');
  });
});
