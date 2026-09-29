import { useState } from 'react';
import { weekRowShortText, type WeekBudget } from '../lib/weekBudget.ts';
import { Parts } from './Parts.tsx';
import { WeekBudgetSheet } from './WeekBudgetSheet.tsx';

interface WeekBudgetRowProps {
  week: WeekBudget;
}

/**
 * Veckoraden under kaloriringen/-stapeln (Översikt → Idag, Mat → Dag): en rad med vad som är
 * kvar av veckans budget (7 × dagsmålet) och ≈ per dag resten av veckan, med › till höger.
 * Tryck öppnar veckopanelen med intag, saldo, staplar per dag och golvnotisen.
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
        <span className="week-budget-text" data-testid="week-row-text">
          <Parts text={weekRowShortText(week)} />
        </span>
        <span className="list-row-chevron" aria-hidden="true" />
      </button>
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
