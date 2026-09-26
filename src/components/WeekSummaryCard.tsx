import { todayIso } from '../lib/dates.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import type { AppData } from '../lib/useAppData.ts';
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
  if (!loaded) return null;
  const entry = lastCompletedWeek(data, todayIso(now));
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
          className="button button-secondary button-small"
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
