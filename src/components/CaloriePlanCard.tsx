import type { Profile } from '../db/db.ts';
import { formatDate, formatInt, formatKcal, formatRate } from '../lib/format.ts';
import type { PlanResult } from '../lib/plan.ts';
import { goalDateText, limitText, tdeeSourceLabel, tdeeSourceText } from '../lib/planText.ts';

interface CaloriePlanCardProps {
  profile: Profile;
  result: PlanResult;
}

/** Översikt: dagens kalorimål, takt, prognos och sakliga förklaringar vid spärrar. */
export function CaloriePlanCard({ profile, result }: CaloriePlanCardProps) {
  if (result.kind === 'incomplete-profile') {
    return (
      <section className="card" aria-labelledby="plan-title">
        <h2 className="card-title" id="plan-title">
          Kalorimål
        </h2>
        <p className="muted" data-testid="plan-missing">
          Fyll i kön, födelseår och aktivitetsnivå under <a href="#/installningar">Inställningar</a>{' '}
          så räknas ett dagligt kalorimål ut.
        </p>
      </section>
    );
  }

  const { plan, adaptive } = result;
  const notes = [
    ...plan.limits.map((l) => limitText(l, plan)),
    goalDateText(plan, profile.goalDate),
  ].filter((n): n is string => n !== null);
  const reached = plan.limits.includes('goal-reached');
  const maintaining = reached || plan.limits.includes('maintenance');

  return (
    <section className="card" aria-labelledby="plan-title">
      <h2 className="card-title" id="plan-title">
        Kalorimål
      </h2>
      <dl className="stats">
        <div className="stat">
          <dt>Dagens kalorimål</dt>
          <dd data-testid="calorie-target">{formatKcal(plan.targetKcal)}</dd>
        </div>
        <div className="stat">
          <dt>Takt</dt>
          <dd data-testid="plan-rate">{maintaining ? 'Håll vikten' : formatRate(plan.rateKg)}</dd>
        </div>
        <div className="stat">
          <dt>Når målvikten</dt>
          <dd data-testid="plan-forecast">
            {reached ? 'Nådd' : plan.forecastDate ? `ca ${formatDate(plan.forecastDate)}` : '–'}
          </dd>
        </div>
        <div className="stat">
          <dt>Förbrukning</dt>
          <dd data-testid="plan-tdee">{formatKcal(plan.tdee)}</dd>
        </div>
      </dl>
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
      </details>
    </section>
  );
}
