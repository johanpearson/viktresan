import type { Profile } from '../db/db.ts';
import { formatInt, formatKcal, formatRate } from '../lib/format.ts';
import type { PlanResult } from '../lib/plan.ts';
import { goalDateText, limitText, tdeeSourceLabel, tdeeSourceText } from '../lib/planText.ts';
import { ListRow } from './ListRow.tsx';

interface CalorieDetailsProps {
  profile: Profile;
  result: PlanResult;
  /** Dagens intag (kcal). */
  eatenKcal: number;
}

/**
 * Kaloriringens detaljer (panel från Översikt → Idag): dagens mål, takt, förbrukning (adaptiv
 * eller formel), sakliga förklaringar vid spärrar och "Så räknas målet ut". Måldatumet visas
 * bara på viktkortet – här finns inget andra datum som kan säga emot det.
 */
export function CalorieDetails({ profile, result, eatenKcal }: CalorieDetailsProps) {
  if (result.kind === 'incomplete-profile') {
    return (
      <p className="form-note" data-testid="plan-missing">
        Fyll i kön, födelseår och aktivitetsnivå under{' '}
        <a href="#/installningar/profil">Inställningar → Profil</a> så räknas ett dagligt kalorimål
        ut.
      </p>
    );
  }

  const { plan, adaptive } = result;
  const notes = [
    ...plan.limits.map((l) => limitText(l, plan)),
    goalDateText(plan, profile.goalDate),
  ].filter((n): n is string => n !== null);
  const maintaining = plan.limits.includes('goal-reached') || plan.limits.includes('maintenance');
  const left = plan.targetKcal - Math.round(eatenKcal);

  return (
    <div className="calorie-details" data-testid="calorie-details">
      <ul className="list list-flush">
        <ListRow
          primary="Dagens kalorimål"
          secondary={
            left >= 0 ? `${formatKcal(left)} kvar idag` : `${formatKcal(-left)} över dagens mål`
          }
          value={<span data-testid="calorie-target">{formatKcal(plan.targetKcal)}</span>}
        />
        <ListRow
          primary="Takt"
          value={
            <span data-testid="plan-rate">
              {maintaining ? 'Håll vikten' : formatRate(plan.rateKg)}
            </span>
          }
        />
        <ListRow
          primary="Förbrukning"
          secondary={tdeeSourceLabel(adaptive)}
          value={<span data-testid="plan-tdee">{formatKcal(plan.tdee)}</span>}
        />
      </ul>
      {notes.length > 0 && (
        <ul className="plan-notes" data-testid="plan-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <details className="plan-details">
        <summary>Så räknas målet ut · {tdeeSourceLabel(adaptive)}</summary>
        <p data-testid="plan-source">{tdeeSourceText(adaptive)}</p>
        <p>
          Basalomsättning {formatKcal(plan.bmr)} (Mifflin-St Jeor, {plan.ageYears} år) × aktivitet ={' '}
          {formatKcal(plan.formulaTdee)}. Underskott {formatInt(Math.round(plan.deficitKcal))}{' '}
          kcal/dag ({formatRate(plan.rateKg)} × 7 700 kcal/kg ÷ 7). Högsta tillåtna takt är 1 % av
          trendvikten per vecka, högst 1 kg, och målet går aldrig under {formatKcal(plan.floorKcal)}
          .
        </p>
        <p>
          Veckobudget = 7 × dagsmålet = {formatKcal(Math.round(plan.targetKcal) * 7)}{' '}
          (måndag–söndag). Veckoraden under ringarna visar vad som är kvar och ungefär hur mycket
          det blir per dag resten av veckan – aldrig under kalorigolvet. Dagar utan matlogg räknas
          som 0 kcal.
        </p>
      </details>
    </div>
  );
}
