import { EmptyState } from '../components/Page.tsx';
import { WeekSummaryView } from '../components/WeekSummaryView.tsx';
import { todayIso } from '../lib/dates.ts';
import { useAppData } from '../lib/useAppData.ts';
import { pastWeeks, weekTitle } from '../lib/weekSummary.ts';

/** Framsteg → Veckor: summering av varje avslutad vecka med data, senaste först. */
export function Veckor() {
  const { data } = useAppData();
  if (!data) return null;
  const weeks = pastWeeks(data, todayIso());
  if (weeks.length === 0) {
    return (
      <EmptyState>
        Här samlas en summering av varje avslutad vecka. Den första visas efter din första hela
        vecka med loggar.
      </EmptyState>
    );
  }
  return (
    <ol className="week-list" aria-label="Veckosummeringar" data-testid="week-list">
      {weeks.map((entry) => (
        <li key={entry.summary.from}>
          <section className="card" aria-labelledby={`week-${entry.summary.from}`}>
            <h2 className="card-title" id={`week-${entry.summary.from}`}>
              {weekTitle(entry.summary)}
            </h2>
            <WeekSummaryView entry={entry} profile={data.profile} />
          </section>
        </li>
      ))}
    </ol>
  );
}
