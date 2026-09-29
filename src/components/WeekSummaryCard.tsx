import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import type { AppData } from '../lib/useAppData.ts';
import { fiberWeekInput, useFiber } from '../lib/useFiber.ts';
import { hasWeekData, lastCompletedWeek, weekTitle } from '../lib/weekSummary.ts';
import { WeekSummaryView } from './WeekSummaryView.tsx';

interface WeekSummaryCardProps {
  data: AppData;
  now: Date;
}

/**
 * Översikt: summering av förra veckan. Visas från veckans första öppning (måndag)
 * tills den stängs; finns sedan kvar under Framsteg → Veckor.
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
    <section className="card" aria-labelledby="week-card-title" data-testid="week-card">
      <div className="week-card-header">
        <div>
          <h2 className="card-title" id="week-card-title">
            Förra veckan
          </h2>
          <p className="muted hero-meta">{weekTitle(entry.summary)}</p>
        </div>
        <button
          type="button"
          className="button button-ghost button-small"
          aria-label="Stäng veckosummeringen"
          onClick={() => void setPreference('weekCardDismissed', entry.summary.from)}
        >
          Stäng
        </button>
      </div>
      <WeekSummaryView entry={entry} profile={data.profile} />
      <a href="#/framsteg/veckor">Alla veckor</a>
    </section>
  );
}
