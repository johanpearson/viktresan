import { formatKcal } from '../lib/format.ts';
import type { WeekBudget, WeekShortfall } from '../lib/weekBudget.ts';

interface WeekShortfallNoteProps {
  week: WeekBudget;
  shortfall: WeekShortfall;
}

/**
 * Budgeten räcker inte till kalorigolvet resten av veckan: sakligt, utan varningsfärg, och
 * med förslaget att sprida resten över nästa vecka – aldrig att äta under golvet.
 */
export function WeekShortfallNote({ week, shortfall }: WeekShortfallNoteProps) {
  return (
    <p className="form-note" role="note" data-testid="week-shortfall">
      {shortfall.exceeded ? (
        <>
          Veckobudgeten är överskriden med{' '}
          <span className="nowrap">{formatKcal(shortfall.exceededKcal)}</span>.{' '}
        </>
      ) : (
        'Veckobudgeten räcker inte till kalorigolvet resten av veckan. '
      )}
      Ät ändå minst <span className="nowrap">{formatKcal(week.floorKcal)}</span> per dag
      {shortfall.overKcal > 0 && (
        <>
          {' '}
          och sprid hellre <span className="nowrap">{formatKcal(shortfall.overKcal)}</span> över
          nästa vecka (ca <span className="nowrap">{formatKcal(shortfall.nextWeekPerDayKcal)}</span>{' '}
          mindre per dag)
        </>
      )}
      .
    </p>
  );
}
