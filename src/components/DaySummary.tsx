import { formatGrams, formatInt, formatKcal } from '../lib/format.ts';
import type { Nutrients } from '../lib/nutrition.ts';
import type { WeekBudget } from '../lib/weekBudget.ts';
import { StatBar } from './StatBar.tsx';
import { WeekBudgetStatus } from './WeekBudgetStatus.tsx';

interface DaySummaryProps {
  totals: Nutrients;
  /** Dagens kalorimål, `null` om profilen saknar underlag. */
  targetKcal: number | null;
  /** Dagligt proteinmål i gram, `null` utan profil. */
  proteinGoalG: number | null;
  /** "idag" eller ett datum – ingår i staplarnas namn. */
  when: string;
  /**
   * `mini`: bara kcal och protein på en rad (sticky vid scroll). Den är en
   * visuell kopia av den fulla summeringen och döljs för skärmläsare.
   */
  variant?: 'full' | 'mini';
  /** Veckoläge: `targetKcal` är dagens förslag och veckans status visas under makrona. */
  week?: WeekBudget | null;
}

/**
 * Mat → Dag: kalorier och protein mot målen som StatBar på en rad, makron som text och i
 * veckoläge veckans budget.
 */
export function DaySummary({
  totals,
  targetKcal,
  proteinGoalG,
  when,
  variant = 'full',
  week = null,
}: DaySummaryProps) {
  const kcal = Math.round(totals.kcal);
  const protein = Math.round(totals.proteinG);
  const remaining = targetKcal == null ? null : targetKcal - kcal;
  const mini = variant === 'mini';

  const bars = (
    <>
      <StatBar
        mini={mini}
        tone="food"
        value={kcal}
        goal={targetKcal}
        unit="kcal"
        label={`Kalorier ${when}`}
        valueText={
          targetKcal == null ? undefined : `${formatInt(kcal)} av ${formatInt(targetKcal)} kcal`
        }
        valueTestId={mini ? undefined : 'intake'}
        metaTestId="remaining-kcal"
        meta={
          remaining == null
            ? undefined
            : remaining >= 0
              ? `${formatKcal(remaining)} kvar${week ? ' idag' : ''}`
              : `${formatKcal(-remaining)} över${week ? ' idag' : ''}`
        }
      />
      <StatBar
        mini={mini}
        tone="protein"
        value={protein}
        goal={proteinGoalG}
        unit="g protein"
        label={`Protein ${when}`}
        valueText={
          proteinGoalG == null
            ? undefined
            : `${formatInt(protein)} g av ${formatInt(proteinGoalG)} g`
        }
        meta={
          proteinGoalG == null
            ? undefined
            : protein >= proteinGoalG
              ? 'Målet nått'
              : `${formatGrams(proteinGoalG - protein)} kvar`
        }
      />
    </>
  );

  if (mini) {
    return (
      <div className="day-summary-mini" aria-hidden="true" data-testid="day-summary-mini">
        {bars}
      </div>
    );
  }

  return (
    <section className="card day-summary" aria-label="Dagens summering">
      <div className="totals-row">{bars}</div>
      <p className="macro-line" data-testid="macros">
        Protein {formatGrams(Math.round(totals.proteinG))} · Kolhydrater{' '}
        {formatGrams(Math.round(totals.carbsG))} · Fett {formatGrams(Math.round(totals.fatG))}
      </p>
      {week && <WeekBudgetStatus week={week} />}
      {targetKcal == null && (
        <p className="form-note muted">
          Fyll i kön, födelseår och aktivitetsnivå under{' '}
          <a href="#/installningar/profil">Inställningar</a> så räknas ett kalorimål ut.
        </p>
      )}
    </section>
  );
}
