import { useState } from 'react';
import { AskAi } from '../components/AskAi.tsx';
import { BottomSheet } from '../components/BottomSheet.tsx';
import { Feature } from '../components/Feature.tsx';
import { EmptyState } from '../components/Page.tsx';
import { WeekSummaryView } from '../components/WeekSummaryView.tsx';
import { aiContextFrom, weekSubject } from '../lib/aiPrompt.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDayMonth } from '../lib/format.ts';
import { useAppData } from '../lib/useAppData.ts';
import { pastWeeks, weekTitle, type WeekSummary } from '../lib/weekSummary.ts';

/** Framsteg → Veckor: summering av varje avslutad vecka med data, senaste först. */
export function Veckor() {
  const { data } = useAppData();
  const [asking, setAsking] = useState<WeekSummary | null>(null);
  if (!data) return null;
  const today = todayIso();
  const weeks = pastWeeks(data, today);
  if (weeks.length === 0) {
    return (
      <EmptyState>
        Här samlas en summering av varje avslutad vecka. Den första visas efter din första hela
        vecka med loggar.
      </EmptyState>
    );
  }
  return (
    <>
      <ol className="week-list" aria-label="Veckosummeringar" data-testid="week-list">
        {weeks.map((entry) => (
          <li key={entry.summary.from}>
            <section className="card" aria-labelledby={`week-${entry.summary.from}`}>
              <h2 className="card-title" id={`week-${entry.summary.from}`}>
                {weekTitle(entry.summary)}
              </h2>
              <WeekSummaryView entry={entry} profile={data.profile} />
              {entry.summary.foodDays > 0 && (
                <Feature id="mat">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => {
                      setAsking(entry.summary);
                    }}
                  >
                    Fråga AI om veckan
                  </button>
                </Feature>
              )}
            </section>
          </li>
        ))}
      </ol>
      {asking && (
        <BottomSheet
          full
          title={`Fråga AI om veckan ${formatDayMonth(asking.from)}–${formatDayMonth(asking.to)}`}
          onClose={() => {
            setAsking(null);
          }}
        >
          <AskAi
            subject={weekSubject(data.foodLog, asking.from, asking.to)}
            context={aiContextFrom(data, today)}
          />
        </BottomSheet>
      )}
    </>
  );
}
