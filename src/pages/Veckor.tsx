import { useState } from 'react';
import { AskAi } from '../components/AskAi.tsx';
import { BottomSheet } from '../components/BottomSheet.tsx';
import { Card } from '../components/Card.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { Feature } from '../components/Feature.tsx';
import { ListRow } from '../components/ListRow.tsx';
import { Parts } from '../components/Parts.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { WeekSummaryView } from '../components/WeekSummaryView.tsx';
import { aiContextFrom, weekSubject } from '../lib/aiPrompt.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDayMonth, formatKg } from '../lib/format.ts';
import { useAppData } from '../lib/useAppData.ts';
import {
  pastWeeks,
  weekName,
  weekRange,
  weekTitle,
  type WeekEntry,
  type WeekSummary,
} from '../lib/weekSummary.ts';

/**
 * Framsteg → Veckor: en rad per avslutad vecka med data, senaste först (vecka, datum,
 * loggade dagar, trendens förändring). Tryck = hela summeringen i en panel, med "Fråga AI".
 */
export function Veckor() {
  const { data } = useAppData();
  const [open, setOpen] = useState<WeekEntry | null>(null);
  const [asking, setAsking] = useState<WeekSummary | null>(null);
  if (!data) return <Skeleton cards={1} lines={6} />;
  const today = todayIso();
  const weeks = pastWeeks(data, today);
  if (weeks.length === 0) {
    return (
      <EmptyState
        title="Inga hela veckor ännu"
        action={{ label: 'Logga vikt', href: '#/logga/vikt' }}
      >
        Här samlas en summering av varje avslutad vecka. Den första visas efter din första hela
        vecka med loggar.
      </EmptyState>
    );
  }
  return (
    <>
      <Card title="Avslutade veckor" testId="week-list">
        <ul className="list">
          {weeks.map((entry) => {
            const { summary } = entry;
            const change = summary.trendChangeKg;
            return (
              <ListRow
                key={summary.from}
                testId="week"
                primary={weekName(summary)}
                secondary={
                  <Parts
                    text={`${weekRange(summary)} · loggat ${String(summary.loggedDays)} av 7 dagar${change == null ? ' · ingen vägning' : ''}`}
                  />
                }
                value={
                  change == null ? undefined : (
                    <span className="num">
                      <span className="visually-hidden">Trendvikt </span>
                      {formatKg(change, { signed: true })}
                    </span>
                  )
                }
                chevron
                onClick={() => {
                  setOpen(entry);
                }}
              />
            );
          })}
        </ul>
      </Card>
      {open && (
        <BottomSheet
          title={weekTitle(open.summary)}
          onClose={() => {
            setOpen(null);
          }}
        >
          <WeekSummaryView entry={open} profile={data.profile} />
          {open.summary.foodDays > 0 && (
            <Feature id="mat">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setAsking(open.summary);
                }}
              >
                Fråga AI om veckan
              </button>
            </Feature>
          )}
        </BottomSheet>
      )}
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
