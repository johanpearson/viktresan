import { describe, expect, it } from 'vitest';
import {
  countLogged,
  foodRemovalText,
  mealSlotRemovalText,
  recipeRemovalText,
  supplementRemovalText,
} from './removal.ts';

describe('vad som händer vid borttagning', () => {
  it('räknar loggade poster av ett livsmedel', () => {
    const log = [{ foodId: 'egen:a' }, { foodId: 'egen:b' }, { foodId: 'egen:a' }];
    expect(countLogged(log, 'egen:a')).toBe(2);
    expect(countLogged(log, 'egen:c')).toBe(0);
  });

  it('säger att loggen finns kvar – och vad mer som försvinner', () => {
    expect(foodRemovalText(3)).toContain('3 loggade poster finns kvar i loggen');
    expect(foodRemovalText(0)).toContain('inget i loggen påverkas');
    expect(recipeRemovalText(1, 2.5)).toBe(
      'Receptet försvinner ur Egna, sökningen och snabbvalen. 1 loggad post finns kvar – de har en egen kopia av receptet. Matlådorna (2,5 portioner kvar) försvinner också.',
    );
    expect(supplementRemovalText(12)).toContain('12 tagna doser finns kvar');
    expect(mealSlotRemovalText(4, 'Middag')).toContain('4 loggade poster flyttas till Middag');
    expect(mealSlotRemovalText(0, 'Middag')).toContain('Inga poster är loggade');
  });
});
