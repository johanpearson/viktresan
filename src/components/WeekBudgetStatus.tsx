import { formatInt, formatKcal } from '../lib/format.ts';
import type { WeekBudget } from '../lib/weekBudget.ts';
import { StatBar } from './StatBar.tsx';

interface WeekBudgetStatusProps {
  week: WeekBudget;
}

function daysText(days: number): string {
  return days === 1 ? '1 dag' : `${String(days)} dagar`;
}

/**
 * Veckoläge: veckans budget som `StatBar` (använt / budget, kvar och dagar kvar),
 * dagens förslag och – när budgeten inte räcker till kalorigolvet – ett sakligt
 * förslag att fördela resten över nästa vecka. Används i Mat → Dag och på Översikt.
 */
export function WeekBudgetStatus({ week }: WeekBudgetStatusProps) {
  const used = week.eatenKcal + week.assumedKcal;
  const over = week.remainingKcal < 0;
  return (
    <div className="week-budget" data-testid="week-budget-status">
      <StatBar
        title="Veckan"
        tone="food"
        value={used}
        goal={week.budgetKcal}
        unit="kcal"
        label="Veckobudget"
        valueText={`${formatInt(used)} av ${formatInt(week.budgetKcal)} kcal`}
        valueTestId="week-budget-used"
        metaTestId="week-budget-left"
        meta={`${over ? `${formatKcal(-week.remainingKcal)} över` : `${formatKcal(week.remainingKcal)} kvar`} · ${daysText(week.daysLeft)} kvar`}
      />
      <p className="week-budget-line" data-testid="week-suggestion">
        Förslag idag <strong className="kcal">{formatKcal(week.suggestedKcal)}</strong>
      </p>
      {week.shortfall && (
        <p className="form-note" role="note" data-testid="week-shortfall">
          Budgeten räcker inte till kalorigolvet ({formatKcal(week.floorKcal)} per dag) resten av
          veckan. Ät hellre {formatKcal(week.floorKcal)} per dag och fördela resten,{' '}
          <span className="nowrap">{formatKcal(week.shortfall.carryKcal)}</span>, över nästa vecka
          (ca <span className="nowrap">{formatKcal(week.shortfall.nextWeekPerDayKcal)}</span> mindre
          per dag).
        </p>
      )}
      {week.assumedDays > 0 && (
        <p className="form-note muted">
          {daysText(week.assumedDays)} utan matlogg räknas som dagsmålet.
        </p>
      )}
    </div>
  );
}
