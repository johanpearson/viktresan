import { useId, useState } from 'react';
import { formatGrams, formatInt, formatKcal } from '../lib/format.ts';
import { fiberAmountOf, type FiberGoal, type FiberTotal } from '../lib/fiber.ts';
import type { Nutrients } from '../lib/nutrition.ts';
import type { WeekBudget } from '../lib/weekBudget.ts';
import { FiberMissingNote } from './FiberMissingNote.tsx';
import { FiberNote } from './FiberNote.tsx';
import { InfoButton } from './InfoButton.tsx';
import { Macros } from './Macros.tsx';
import { StatBar } from './StatBar.tsx';
import { WeekBudgetRow } from './WeekBudgetRow.tsx';

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
  /** Veckan som dagen ligger i: veckoraden under makrona (inte i miniraden). */
  week?: WeekBudget | null;
  /** Gapraden under staplarna ("41 g protein och 6 g fiber kvar"), `null` när allt är inom 10 %. */
  gapText?: string | null;
  /** Knappen "Vad ska jag äta?" (bara idag). */
  onWhatToEat?: (() => void) | undefined;
}

/**
 * Mat → Dag: kalorier och protein mot målen som StatBar på en rad (med fibermålet: kalorier
 * överst, protein och fiber under), gapraden med "Vad ska jag äta?", makron som text och veckoraden.
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
  gapText = null,
  onWhatToEat,
}: DaySummaryProps) {
  const kcal = Math.round(totals.kcal);
  const protein = Math.round(totals.proteinG);
  const remaining = targetKcal == null ? null : targetKcal - kcal;
  const mini = variant === 'mini';
  const [fiberInfo, setFiberInfo] = useState(false);
  const fiberInfoId = useId();
  // Poster utan fiberdata: asterisk vid fibervärdet och en info-ikon med förklaringen. Med
  // fibermålet även när ingen post har fiberdata (värdet är då "–" och stapeln står på 0).
  const fiberMissing =
    fiberDay && fiberDay.missingEntries > 0 && (fiberDay.knownEntries > 0 || fiber)
      ? fiberDay.missingEntries
      : 0;

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
              ? `${formatKcal(remaining)} kvar`
              : `${formatKcal(-remaining)} över`
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
      {(gapText !== null || onWhatToEat) && (
        <div className="gap-row">
          {gapText !== null && (
            <p className="gap-line" data-testid="gap-line">
              {gapText}
            </p>
          )}
          {onWhatToEat && (
            <button
              type="button"
              className="button button-secondary button-small what-to-eat"
              aria-haspopup="dialog"
              onClick={onWhatToEat}
            >
              Vad ska jag äta?
            </button>
          )}
        </div>
      )}
      {fiber && <FiberNote goal={fiber.goal} />}
      <p className="macro-line" data-testid="macros">
        <Macros
          variant="long"
          round
          nutrients={totals}
          fiber={fiberDay ? fiberAmountOf(fiberDay) : undefined}
          fiberInfo={
            fiberMissing > 0 && (
              <InfoButton
                label="Om fibervärdet"
                expanded={fiberInfo}
                controls={fiberInfoId}
                testId="fiber-info"
                onToggle={() => {
                  setFiberInfo((o) => !o);
                }}
              />
            )
          }
        />
      </p>
      {fiberMissing > 0 && fiberInfo && (
        <FiberMissingNote id={fiberInfoId} missing={fiberMissing} />
      )}
      {week && <WeekBudgetRow week={week} />}
      {targetKcal == null && (
        <p className="form-note muted">
          Fyll i kön, födelseår och aktivitetsnivå under{' '}
          <a href="#/installningar/profil">Inställningar</a> så räknas ett kalorimål ut.
        </p>
      )}
    </section>
  );
}
