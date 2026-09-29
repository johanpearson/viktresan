import { fiberGoalText, type FiberGoal, type FiberTotal } from '../lib/fiber.ts';

interface FiberNoteProps {
  goal: FiberGoal;
  /** Dagens fiber, `null` medan fiberdatan laddas. */
  day: FiberTotal | null;
}

/**
 * Kort rad under fiberringen/-stapeln: veckans mål under upptrappningen och en diskret
 * notis när poster saknar fiberdata (snabbloggar, produkter utan värdet).
 */
export function FiberNote({ goal, day }: FiberNoteProps) {
  const missing = day?.missingEntries ?? 0;
  if (!goal.ramping && missing === 0) return null;
  return (
    <p className="form-note fiber-note" data-testid="fiber-note">
      {goal.ramping && (
        <span className="nowrap" data-testid="fiber-week-goal">
          {fiberGoalText(goal)}.
        </span>
      )}
      {goal.ramping && missing > 0 && ' '}
      {missing > 0 && (
        <span className="muted" data-testid="fiber-incomplete">
          Dagens fiber kan vara i underkant –{' '}
          {missing === 1 ? '1 post' : `${String(missing)} poster`} saknar fiberdata.
        </span>
      )}
    </p>
  );
}
