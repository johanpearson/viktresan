import { formatInt, formatKcal, formatShortDate, formatSignedKcal } from '../lib/format.ts';
import type { WeekBudget, WeekDay } from '../lib/weekBudget.ts';
import { isoWeekNumber } from '../lib/weekSummary.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { ListRow } from './ListRow.tsx';
import { WeekShortfallNote } from './WeekShortfallNote.tsx';

interface WeekBudgetSheetProps {
  week: WeekBudget;
  onClose: () => void;
}

const SHORT = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
const LONG = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];

function dayValue(day: WeekDay): string {
  if (day.kcal !== null) return formatInt(day.kcal);
  return day.status === 'future' ? '–' : 'ej loggad';
}

function dayText(day: WeekDay, index: number, target: number): string {
  const name = `${LONG[index] ?? ''} ${formatShortDate(day.date)}`;
  if (day.kcal === null) {
    return `${name}: ${day.status === 'future' ? 'kommande dag' : 'ej loggad'}`;
  }
  return `${name}: ${formatKcal(day.kcal)} av ${formatKcal(target)}`;
}

function daysText(days: number): string {
  return days === 1 ? '1 dag' : `${String(days)} dagar`;
}

/**
 * Veckopanelen (tryck på veckoraden): veckans dagar som staplar mot dagsmålet (streckad
 * linje), dagar utan matlogg som "ej loggad", och veckans budget, kvar och saldo.
 */
export function WeekBudgetSheet({ week, onClose }: WeekBudgetSheetProps) {
  const target = week.dailyTargetKcal;
  const top = Math.max(target * 1.25, ...week.days.map((d) => d.kcal ?? 0));
  const goalPercent = top > 0 ? (target / top) * 100 : 0;
  const title = `Vecka ${String(isoWeekNumber(week.from))} · ${formatShortDate(week.from)}–${formatShortDate(week.to)}`;

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="week-sheet" data-testid="week-sheet">
        <ol className="week-chart" aria-label="Intag per dag mot dagsmålet">
          {week.days.map((day, i) => (
            <li
              key={day.date}
              className={`week-chart-day week-day-${day.status}${day.kcal === null ? ' week-day-empty' : ''}`}
              data-testid={`week-day-${day.date}`}
            >
              <span className="visually-hidden">{dayText(day, i, target)}</span>
              <span className="week-chart-value" aria-hidden="true">
                {dayValue(day)}
              </span>
              <span className="week-chart-track tone-food" aria-hidden="true">
                {/* React-style sätts via CSSOM och omfattas inte av CSP:ns style-src. */}
                <span className="week-chart-goal" style={{ bottom: `${String(goalPercent)}%` }} />
                {day.kcal !== null && (
                  <span
                    className="week-chart-bar"
                    style={{ height: `${String(top > 0 ? (day.kcal / top) * 100 : 0)}%` }}
                  />
                )}
              </span>
              <span className="week-chart-label" aria-hidden="true">
                {SHORT[i]}
              </span>
            </li>
          ))}
        </ol>
        <p className="form-note muted week-chart-legend">
          Streckad linje = dagsmålet <span className="nowrap">{formatKcal(target)}</span>.
          {week.unloggedDays > 0 &&
            ` ${daysText(week.unloggedDays)} utan matlogg räknas som 0 kcal.`}
        </p>
        <ul className="list list-flush">
          <ListRow
            primary="Loggat"
            value={
              <span className="num" data-testid="week-sheet-eaten">
                {formatInt(week.eatenKcal)} av {formatKcal(week.budgetKcal)}
              </span>
            }
          />
          <ListRow
            primary={week.remainingKcal >= 0 ? 'Kvar' : 'Över budgeten'}
            value={<span className="num">{formatKcal(Math.abs(week.remainingKcal))}</span>}
          />
          {week.perDayKcal !== null && (
            <ListRow
              primary="Per dag resten av veckan"
              secondary="Idag medräknad, aldrig under kalorigolvet"
              value={<span className="num">≈ {formatKcal(week.perDayKcal)}</span>}
            />
          )}
          <ListRow
            primary={week.daysLeft > 0 ? 'Saldo hittills' : 'Saldo för veckan'}
            secondary={
              week.daysLeft > 0
                ? 'Loggat mot dagsmålet för dagarna före idag'
                : 'Loggat mot veckobudgeten'
            }
            value={
              <span className="num" data-testid="week-sheet-balance">
                {formatSignedKcal(week.balanceKcal)}
              </span>
            }
          />
        </ul>
        {week.shortfall && <WeekShortfallNote week={week} shortfall={week.shortfall} />}
      </div>
    </BottomSheet>
  );
}
