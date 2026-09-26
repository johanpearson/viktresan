import { formatMl } from '../lib/format.ts';
import type { WaterGoal } from '../lib/water.ts';

interface DrinkGoalNoteProps {
  goal: WaterGoal;
  /** Dagens dryck ur matloggen. */
  foodMl: number;
}

/** Kort rad under dryckesringen: hur mycket som kommer från Mat och ev. träningstillägg. */
export function DrinkGoalNote({ goal, foodMl }: DrinkGoalNoteProps) {
  const parts: string[] = [];
  if (foodMl > 0) parts.push(`Varav ${formatMl(foodMl)} från Mat`);
  if (goal.bonusMl > 0) parts.push(`målet +${formatMl(goal.bonusMl)} för dagens pass`);
  if (parts.length === 0) return null;
  const text = parts.join(' · ');
  return (
    <p className="form-note drink-note" data-testid="drink-note">
      {text.charAt(0).toUpperCase() + text.slice(1)}.
    </p>
  );
}
