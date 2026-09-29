import { formatGrams, formatInt, formatKcal } from '../lib/format.ts';
import { fiberAmountOf, type FiberGoal, type FiberTotal } from '../lib/fiber.ts';
import type { Nutrients } from '../lib/nutrition.ts';
import type { WeekBudget } from '../lib/weekBudget.ts';
import { FiberNote } from './FiberNote.tsx';
import { Macros } from './Macros.tsx';
import { StatBar } from './StatBar.tsx';
import { WeekBudgetStatus } from './WeekBudgetStatus.tsx';

interface DaySummaryProps {
  totals: Nutrients;
  /** Dagens kalorimål, `null` om profilen saknar underlag. */
  targetKcal: number | null;
  /** Dagligt proteinmål i gram, `null` utan profil. */
  proteinGoalG: number | null;
  /** Fibermålet och dagens fiber (`total` = `null` medan datan laddas), `null` när målet är av. */
  fiber?: { goal: FiberGoal; total: FiberTotal | null } | null;
  /** Dagens fiber i makroraden (oberoende av fibermålet), `null` medan fiberdatan laddas. */
  fiberDay?: FiberTotal | null;
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
 * Mat → Dag: kalorier och protein mot målen som StatBar på en rad (med fibermålet: kalorier
 * överst, protein och fiber under), makron som text och i
 * veckoläge veckans budget.
 */
export function DaySummary({
  totals,
  targetKcal,
  proteinGoalG,
  fiber = null,
  fiberDay = null,
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

  const fiberG = Math.round(fiber?.total?.fiberG ?? 0);
  const fiberBar = fiber && (
    <StatBar
      tone="fiber"
      value={fiberG}
      goal={fiber.goal.goalG}
      unit="g fiber"
      label={`Fiber ${when}`}
      valueText={`${formatInt(fiberG)} g av ${formatInt(fiber.goal.goalG)} g`}
      valueTestId="fiber-intake"
      meta={
        fiberG >= fiber.goal.goalG ? 'Målet nått' : `${formatGrams(fiber.goal.goalG - fiberG)} kvar`
      }
    />
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
      <div className={fiber ? 'totals-row totals-row-fiber' : 'totals-row'}>
        {bars}
        {fiberBar}
      </div>
      {/* Notisen om saknad fiberdata står under makroraden, så den visas bara en gång. */}
      {fiber && <FiberNote goal={fiber.goal} day={null} />}
      <p className="macro-line" data-testid="macros">
        <Macros
          variant="long"
          round
          nutrients={totals}
          fiber={fiberDay ? fiberAmountOf(fiberDay) : undefined}
        />
      </p>
      {/* Summan har markeringen (*) när någon post saknar fiber; med fibermålet visas notisen även
          när ingen post har fiberdata (stapeln står då på 0). */}
      {fiberDay && fiberDay.missingEntries > 0 && (fiberDay.knownEntries > 0 || fiber) && (
        <p className="form-note muted fiber-note" data-testid="fiber-incomplete">
          {fiberDay.knownEntries > 0 && '* '}Dagens fiber kan vara i underkant –{' '}
          {fiberDay.missingEntries === 1
            ? '1 post saknar'
            : `${String(fiberDay.missingEntries)} poster saknar`}{' '}
          fiberdata.
        </p>
      )}
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
