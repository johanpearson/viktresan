import { useState } from 'react';
import type { FoodLogEntry } from '../db/db.ts';
import { addDays, todayIso } from '../lib/dates.ts';
import { formatInt, formatKcal, formatShortDate } from '../lib/format.ts';
import { averageKcal, dailyIntake } from '../lib/nutrition.ts';
import { filterRange, type RangeId } from '../lib/stats.ts';
import { IntakeChart } from './IntakeChart.tsx';
import { EmptyState } from './Page.tsx';
import { RangeFilter } from './RangeFilter.tsx';

interface IntakeHistoryProps {
  foodLog: readonly FoodLogEntry[];
  targetKcal: number | null;
  proteinGoalG: number | null;
}

/** Mat → Historik: intag per dag mot kalorimålet och 7-dagarssnitt. */
export function IntakeHistory({ foodLog, targetKcal, proteinGoalG }: IntakeHistoryProps) {
  const [range, setRange] = useState<RangeId>('1m');
  const today = todayIso();
  const all = dailyIntake(foodLog);
  if (all.length === 0) return <EmptyState>Ingen mat loggad ännu.</EmptyState>;

  const days = filterRange(all, range, today);
  const week = averageKcal(all, today);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i));

  return (
    <>
      <RangeFilter value={range} onChange={setRange} />
      {days.length === 0 ? (
        <EmptyState>Ingen mat loggad i vald period.</EmptyState>
      ) : (
        <div className="card chart-card">
          <IntakeChart days={days} targetKcal={targetKcal} />
        </div>
      )}
      <section className="card" aria-labelledby="week-intake-title">
        <h2 className="card-title" id="week-intake-title">
          Senaste 7 dagarna
        </h2>
        <p data-testid="intake-average">
          {week
            ? `7-dagarssnitt: ${formatKcal(week.kcal)} per loggad dag (${week.days} av 7 dagar loggade).`
            : 'Ingen mat loggad de senaste 7 dagarna.'}
          {week && targetKcal != null
            ? ` Det är ${formatKcal(Math.abs(week.kcal - targetKcal))} ${week.kcal > targetKcal ? 'över' : 'under'} målet.`
            : ''}
        </p>
        {week && proteinGoalG != null && (
          <p data-testid="protein-average">
            Protein i snitt {formatInt(Math.round(week.proteinG))} g per loggad dag (mål{' '}
            {formatInt(proteinGoalG)} g).
          </p>
        )}
        <table className="table" data-testid="intake-table">
          <thead>
            <tr>
              <th scope="col">Dag</th>
              <th scope="col" className="num">
                Intag
              </th>
              <th scope="col" className="num">
                Mot mål
              </th>
              <th scope="col" className="num">
                Protein
              </th>
            </tr>
          </thead>
          <tbody>
            {last7.map((date) => {
              const day = all.find((d) => d.date === date);
              const diff = day && targetKcal != null ? Math.round(day.kcal - targetKcal) : null;
              return (
                <tr key={date}>
                  <td>{formatShortDate(date)}</td>
                  <td className="num">{day ? formatKcal(day.kcal) : '–'}</td>
                  <td className="num">
                    {diff == null
                      ? '–'
                      : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${formatInt(Math.abs(diff))}`}
                  </td>
                  <td className="num">{day ? `${formatInt(Math.round(day.proteinG))} g` : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
