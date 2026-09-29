import { fluidLossSideEffects, fluidLossText } from '../lib/glp1.ts';
import type { SymptomEntry } from '../db/db.ts';
import { Card } from './Card.tsx';

interface HydrationReminderProps {
  symptoms: readonly SymptomEntry[];
  today: string;
}

/**
 * Översikt: saklig påminnelse om att dricka extra en dag då diarré eller kräkning loggats.
 * Höjer inte dryckesmålet.
 */
export function HydrationReminder({ symptoms, today }: HydrationReminderProps) {
  const effects = fluidLossSideEffects(symptoms, today);
  if (effects.length === 0) return null;
  return (
    <Card title="Drick lite extra idag" tone="warning" testId="hydration-reminder">
      <p className="hydration-text">{fluidLossText(effects)}</p>
    </Card>
  );
}
