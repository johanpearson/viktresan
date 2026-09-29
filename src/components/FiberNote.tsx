import { fiberGoalText, type FiberGoal } from '../lib/fiber.ts';

interface FiberNoteProps {
  goal: FiberGoal;
}

/**
 * Kort rad under fiberringen/-stapeln under upptrappningen: veckans fibermål. Saknad fiberdata
 * visas som en asterisk vid fibervärdet med förklaringen bakom en info-ikon (`FiberMissingNote`).
 */
export function FiberNote({ goal }: FiberNoteProps) {
  if (!goal.ramping) return null;
  return (
    <p className="form-note fiber-note" data-testid="fiber-note">
      <span className="nowrap" data-testid="fiber-week-goal">
        {fiberGoalText(goal)}.
      </span>
    </p>
  );
}
