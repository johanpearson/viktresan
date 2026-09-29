import { useState } from 'react';
import { weekBalanceText, weekRowText, type WeekBudget } from '../lib/weekBudget.ts';
import { Parts } from './Parts.tsx';
import { WeekBudgetSheet } from './WeekBudgetSheet.tsx';
import { WeekShortfallNote } from './WeekShortfallNote.tsx';

interface WeekBudgetRowProps {
  week: WeekBudget;
}

/**
 * Veckoraden under kaloriringen/-stapeln (Översikt → Idag, Mat → Dag): veckans intag mot
 * budgeten (7 × dagsmålet), vad som är kvar och per dag resten av veckan, med saldot under.
 * Tryck öppnar veckopanelen. Räcker inte budgeten till kalorigolvet visas en saklig notis.
 */
export function WeekBudgetRow({ week }: WeekBudgetRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="week-budget" data-testid="week-line">
      <button
        type="button"
        className="week-budget-row"
        aria-haspopup="dialog"
        data-testid="week-row"
        onClick={() => {
          setOpen(true);
        }}
      >
        <span className="week-budget-text">
          <span className="week-budget-main" data-testid="week-row-text">
            <Parts text={weekRowText(week)} />
          </span>
          <span className="week-budget-balance" data-testid="week-balance">
            {weekBalanceText(week)}
          </span>
        </span>
        <span className="list-row-chevron" aria-hidden="true" />
      </button>
      {week.shortfall && <WeekShortfallNote week={week} shortfall={week.shortfall} />}
      {open && (
        <WeekBudgetSheet
          week={week}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
