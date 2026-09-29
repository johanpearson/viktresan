import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import type { AppData } from '../lib/useAppData.ts';
import { fiberWeekInput, useFiber } from '../lib/useFiber.ts';
import { hasWeekData, lastCompletedWeek, weekHeadline, weekTitle } from '../lib/weekSummary.ts';
import { Card } from './Card.tsx';
import { ListRow } from './ListRow.tsx';

interface WeekSummaryCardProps {
  data: AppData;
  now: Date;
}

/**
 * Översikt: kontextkortet för förra veckan – en rad med veckans rubrik. Visas från veckans
 * första öppning (måndag) tills det stängs. Hela summeringen finns under Framsteg → Veckor.
 */
export function WeekSummaryCard({ data, now }: WeekSummaryCardProps) {
  const { loaded, prefs } = usePreferences();
  const today = todayIso(now);
  const glp1 = useFeatures().isEnabled('glp1');
  const fiber = useFiber(data.profile, data.foodLog, today);
  if (!loaded) return null;
  const entry = lastCompletedWeek({ ...data, glp1, fiber: fiberWeekInput(fiber) }, today);
  if (!hasWeekData(entry.summary) || prefs.weekCardDismissed === entry.summary.from) return null;

  return (
    <Card
      title="Förra veckan"
      testId="week-card"
      action={
        <button
          type="button"
          className="button button-ghost button-small"
          aria-label="Stäng veckosummeringen"
          onClick={() => void setPreference('weekCardDismissed', entry.summary.from)}
        >
          Stäng
        </button>
      }
    >
      <ul className="list">
        <ListRow
          primary={
            <span data-testid="week-headline">{weekHeadline(entry.summary, data.profile)}</span>
          }
          secondary={weekTitle(entry.summary)}
          href="#/framsteg/veckor"
          chevron
        />
      </ul>
    </Card>
  );
}
