import { formatGrams, formatInt, formatKcal } from '../lib/format.ts';
import type { Nutrients } from '../lib/nutrition.ts';
import { ProgressBar } from './ProgressBar.tsx';

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
}

/** Mat → Dag: kalorier och protein mot målen som staplar på en rad, makron som text. */
export function DaySummary({
  totals,
  targetKcal,
  proteinGoalG,
  when,
  variant = 'full',
}: DaySummaryProps) {
  const kcal = Math.round(totals.kcal);
  const protein = Math.round(totals.proteinG);
  const remaining = targetKcal == null ? null : targetKcal - kcal;
  const mini = variant === 'mini';

  const kcalBlock = (
    <div className="total">
      <p className="total-value" data-testid={mini ? undefined : 'intake'}>
        <strong>{formatInt(kcal)}</strong>
        {targetKcal == null ? ' kcal' : ` / ${formatInt(targetKcal)} kcal`}
      </p>
      {targetKcal != null &&
        (mini ? (
          <div className="progress progress-kcal progress-thin">
            <div
              className="progress-fill"
              style={{ width: `${String(Math.round(Math.min(1, kcal / targetKcal) * 100))}%` }}
            />
          </div>
        ) : (
          <ProgressBar
            className="progress-kcal progress-thin"
            fraction={kcal / targetKcal}
            label={`Kalorier ${when}`}
            valueText={`${formatInt(kcal)} av ${formatInt(targetKcal)} kcal`}
          />
        ))}
      {!mini && remaining != null && (
        <p className="total-meta" data-testid="remaining-kcal">
          {remaining >= 0 ? `${formatKcal(remaining)} kvar` : `${formatKcal(-remaining)} över`}
        </p>
      )}
    </div>
  );

  const proteinBlock = (
    <div className="total">
      <p className="total-value">
        <strong>{formatInt(protein)}</strong>
        {proteinGoalG == null ? ' g protein' : ` / ${formatInt(proteinGoalG)} g protein`}
      </p>
      {proteinGoalG != null &&
        (mini ? (
          <div className="progress progress-protein progress-thin">
            <div
              className="progress-fill"
              style={{
                width: `${String(Math.round(Math.min(1, protein / proteinGoalG) * 100))}%`,
              }}
            />
          </div>
        ) : (
          <ProgressBar
            className="progress-protein progress-thin"
            fraction={protein / proteinGoalG}
            label={`Protein ${when}`}
            valueText={`${formatInt(protein)} g av ${formatInt(proteinGoalG)} g`}
          />
        ))}
      {!mini && proteinGoalG != null && (
        <p className="total-meta">
          {protein >= proteinGoalG ? 'Målet nått' : `${formatGrams(proteinGoalG - protein)} kvar`}
        </p>
      )}
    </div>
  );

  if (mini) {
    return (
      <div className="day-summary-mini" aria-hidden="true" data-testid="day-summary-mini">
        {kcalBlock}
        {proteinBlock}
      </div>
    );
  }

  return (
    <section className="card day-summary" aria-label="Dagens summering">
      <div className="totals-row">
        {kcalBlock}
        {proteinBlock}
      </div>
      <p className="macro-line" data-testid="macros">
        Protein {formatGrams(Math.round(totals.proteinG))} · Kolhydrater{' '}
        {formatGrams(Math.round(totals.carbsG))} · Fett {formatGrams(Math.round(totals.fatG))}
      </p>
      {targetKcal == null && (
        <p className="form-note muted">
          Fyll i kön, födelseår och aktivitetsnivå under <a href="#/installningar">Inställningar</a>{' '}
          så räknas ett kalorimål ut.
        </p>
      )}
    </section>
  );
}
