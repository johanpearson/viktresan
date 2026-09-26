import { formatDate, formatInt, formatKcal } from '../lib/format.ts';
import type { Nutrients } from '../lib/nutrition.ts';
import { MacroBar } from './MacroBar.tsx';
import { NutritionRings } from './NutritionRings.tsx';
import { ProgressBar } from './ProgressBar.tsx';

interface DaySummaryProps {
  date: string;
  today: string;
  totals: Nutrients;
  /** Dagens kalorimål, `null` om profilen saknar underlag. */
  targetKcal: number | null;
  /** Dagligt proteinmål i gram, `null` utan profil. */
  proteinGoalG: number | null;
}

/** Dagens summering: intag mot mål, kvar och makrofördelning. */
export function DaySummary({ date, today, totals, targetKcal, proteinGoalG }: DaySummaryProps) {
  const intake = Math.round(totals.kcal);
  const remaining = targetKcal == null ? null : targetKcal - intake;
  return (
    <section className="card" aria-labelledby="day-summary-title">
      <h2 className="card-title" id="day-summary-title">
        {date === today ? 'Idag' : formatDate(date)}
      </h2>
      <p className="hero-value" data-testid="intake">
        {formatInt(intake)}
        <span className="hero-unit">
          {targetKcal == null ? ' kcal' : ` / ${formatInt(targetKcal)} kcal`}
        </span>
      </p>
      {remaining == null || targetKcal == null ? (
        <p className="muted hero-meta">
          Fyll i kön, födelseår och aktivitetsnivå under <a href="#/installningar">Inställningar</a>{' '}
          så räknas ett kalorimål ut.
        </p>
      ) : (
        <>
          <p className="hero-meta" data-testid="remaining-kcal">
            {remaining >= 0
              ? `${formatKcal(remaining)} kvar`
              : `${formatKcal(-remaining)} över målet`}
          </p>
          <ProgressBar fraction={intake / targetKcal} label="Intag av kalorimålet" />
        </>
      )}
      <NutritionRings
        kcal={totals.kcal}
        targetKcal={targetKcal}
        proteinG={totals.proteinG}
        proteinGoalG={proteinGoalG}
        when={date === today ? 'idag' : formatDate(date)}
      />
      <MacroBar totals={totals} />
    </section>
  );
}
