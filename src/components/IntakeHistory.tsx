import { useState } from 'react';
import type { FoodLogEntry } from '../db/db.ts';
import type { DayFiber, FiberGoal } from '../lib/fiber.ts';
import { addDays, todayIso } from '../lib/dates.ts';
import { formatGrams, formatInt, formatKcal, formatShortDate } from '../lib/format.ts';
import { averageKcal, dailyIntake } from '../lib/nutrition.ts';
import { filterRange, type RangeId } from '../lib/stats.ts';
import { Card } from './Card.tsx';
import { EmptyState } from './EmptyState.tsx';
import { IntakeChart } from './IntakeChart.tsx';
import { Parts } from './Parts.tsx';
import { RangeFilter } from './RangeFilter.tsx';
import { StatBar } from './StatBar.tsx';

interface IntakeHistoryProps {
  foodLog: readonly FoodLogEntry[];
  targetKcal: number | null;
  proteinGoalG: number | null;
  /** Fiber per dag när fibermålet är på (annars `null` – ingen fiberkolumn). */
  fiberDays?: readonly DayFiber[] | null;
  fiberGoalOn?: (date: string) => FiberGoal | null;
}

/** Mat → Historik: intag per dag mot kalorimålet och 7-dagarssnitt (och fiber med fibermålet). */
export function IntakeHistory({
  foodLog,
  targetKcal,
  proteinGoalG,
  fiberDays = null,
  fiberGoalOn,
}: IntakeHistoryProps) {
  const [range, setRange] = useState<RangeId>('1m');
  const today = todayIso();
  const all = dailyIntake(foodLog);
  if (all.length === 0) {
    return (
      <EmptyState
        title="Ingen mat loggad ännu"
        action={{ label: 'Logga mat', href: '#/mat/logga' }}
      >
        Här ser du intaget per dag mot kalorimålet när du har loggat mat.
      </EmptyState>
    );
  }

  const days = filterRange(all, range, today);
  const week = averageKcal(all, today);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i));

  const avgKcal = week ? Math.round(week.kcal) : 0;
  const avgProtein = week ? Math.round(week.proteinG) : 0;
  const diff = week && targetKcal != null ? avgKcal - targetKcal : null;
  const fiberGoal = fiberDays ? (fiberGoalOn?.(today) ?? null) : null;
  const fiberWeek = fiberDays?.filter((d) => last7.includes(d.date)) ?? [];
  const avgFiber =
    fiberWeek.length > 0
      ? Math.round(fiberWeek.reduce((sum, d) => sum + d.fiberG, 0) / fiberWeek.length)
      : 0;
  const fiberIncomplete = fiberWeek.some((d) => d.missingEntries > 0);

  return (
    <>
      <RangeFilter value={range} onChange={setRange} />
      {days.length === 0 ? (
        <EmptyState>Ingen mat loggad i vald period.</EmptyState>
      ) : (
        <Card title="Intag per dag" className="chart-card">
          <IntakeChart days={days} targetKcal={targetKcal} />
        </Card>
      )}
      <Card title="Senaste 7 dagarna">
        {week ? (
          <>
            <div className={fiberGoal ? 'totals-row totals-row-fiber' : 'totals-row'}>
              <StatBar
                tone="food"
                value={avgKcal}
                goal={targetKcal}
                unit="kcal"
                label="Kalorier i snitt per loggad dag"
                valueText={
                  targetKcal == null
                    ? undefined
                    : `${formatInt(avgKcal)} av ${formatInt(targetKcal)} kcal`
                }
                valueTestId="intake-average-value"
                meta={
                  diff == null
                    ? undefined
                    : `${formatKcal(Math.abs(diff))} ${diff > 0 ? 'över' : 'under'} målet`
                }
              />
              <StatBar
                tone="protein"
                value={avgProtein}
                goal={proteinGoalG}
                unit="g protein"
                label="Protein i snitt per loggad dag"
                valueText={
                  proteinGoalG == null
                    ? undefined
                    : `${formatInt(avgProtein)} g av ${formatInt(proteinGoalG)} g`
                }
                valueTestId="protein-average"
                meta={
                  proteinGoalG == null
                    ? undefined
                    : avgProtein >= proteinGoalG
                      ? 'Målet nått'
                      : `${formatGrams(proteinGoalG - avgProtein)} under målet`
                }
              />
              {fiberGoal && (
                <StatBar
                  tone="fiber"
                  value={avgFiber}
                  goal={fiberGoal.goalG}
                  unit="g fiber"
                  label="Fiber i snitt per loggad dag"
                  valueText={`${formatInt(avgFiber)} g av ${formatInt(fiberGoal.goalG)} g`}
                  valueTestId="fiber-average"
                  meta={
                    avgFiber >= fiberGoal.goalG
                      ? 'Målet nått'
                      : `${formatGrams(fiberGoal.goalG - avgFiber)} under målet`
                  }
                />
              )}
            </div>
            <p className="form-note muted" data-testid="intake-average">
              <Parts text={`Snitt per loggad dag · ${String(week.days)} av 7 dagar loggade`} />
            </p>
          </>
        ) : (
          <p className="muted" data-testid="intake-average">
            Ingen mat loggad de senaste 7 dagarna.
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
              {fiberDays && (
                <th scope="col" className="num">
                  Fiber
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {last7.map((date) => {
              const day = all.find((d) => d.date === date);
              const dayDiff = day && targetKcal != null ? Math.round(day.kcal - targetKcal) : null;
              return (
                <tr key={date}>
                  <td>{formatShortDate(date)}</td>
                  <td className="num">{day ? formatKcal(day.kcal) : '–'}</td>
                  <td className="num">
                    {dayDiff == null
                      ? '–'
                      : `${dayDiff > 0 ? '+' : dayDiff < 0 ? '−' : ''}${formatInt(Math.abs(dayDiff))}`}
                  </td>
                  <td className="num">{day ? `${formatInt(Math.round(day.proteinG))} g` : '–'}</td>
                  {fiberDays && (
                    <td className="num">{fiberCell(fiberDays.find((d) => d.date === date))}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {fiberIncomplete && (
          <p className="form-note muted" data-testid="fiber-history-incomplete">
            * Fibern kan vara i underkant – snabbloggar och varor utan fiberdata räknas inte.
          </p>
        )}
      </Card>
    </>
  );
}

function fiberCell(day: DayFiber | undefined): string {
  // Ingen post med fiberdata: "–", inte 0.
  if (!day || day.knownEntries === 0) return '–';
  return `${formatInt(Math.round(day.fiberG))} g${day.missingEntries > 0 ? '*' : ''}`;
}
