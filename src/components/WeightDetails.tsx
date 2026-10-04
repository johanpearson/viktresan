import type { FoodLogEntry, Profile, WeightEntry } from '../db/db.ts';
import { formatBmi, formatDate, formatKg, formatMonthRange, formatRate } from '../lib/format.ts';
import { CAPPED_NOTE, goalEta, overviewStats, type PlanReason } from '../lib/overview.ts';
import { buildPlan } from '../lib/plan.ts';
import { usePreferences } from '../lib/preferences.ts';
import { bmiCategory, dailyWeights } from '../lib/stats.ts';
import { Card } from './Card.tsx';
import { Disclosure } from './Disclosure.tsx';
import { ForecastExplanation } from './ForecastExplanation.tsx';
import { ListRow } from './ListRow.tsx';

/** Varför datumet är enligt plan – kort, efter "Enligt plan (…)". */
const PLAN_REASONS: Record<PlanReason, string> = {
  early: 'trendprognos efter 21 dagar och 12 vägningar',
  'few-weigh-ins': 'trendprognos efter 21 dagar och 12 vägningar',
  uncertain: 'trenden varierar för mycket för en prognos än',
  'not-progressing': 'trenden leder inte mot målet just nu',
};

interface WeightDetailsProps {
  profile: Profile;
  weights: WeightEntry[];
  foodLog: FoodLogEntry[];
  today: string;
}

/**
 * Framsteg → Historik: detaljerna bakom Översikts viktkort – förändring, kvar till mål, BMI och
 * när målet nås (samma källa som på Översikt: trenden när den räcker, annars vald takt).
 */
export function WeightDetails({ profile, weights, foodLog, today }: WeightDetailsProps) {
  const { prefs } = usePreferences();
  const daily = dailyWeights(weights);
  const stats = overviewStats({ profile, daily, today, preferTrend: prefs.trendHero });
  const plan = buildPlan(profile, weights, foodLog, today);
  const eta = goalEta({
    stats,
    today,
    rateKg: profile.ratePerWeekKg,
    planDate: plan.kind === 'plan' ? plan.plan.forecastDate : null,
  });
  const { progress } = stats;
  const onTrend = stats.source === 'trend';

  let etaValue = '–';
  let etaSecondary: string | undefined;
  if (eta?.kind === 'reached') etaValue = 'Nått';
  else if (eta?.kind === 'trend') {
    etaValue = eta.range
      ? `ca ${formatMonthRange(eta.range.from, eta.range.to)}`
      : `ca ${formatDate(eta.date)}`;
    const rate = `${formatKg(eta.weeklyChangeKg, { signed: true })}/vecka`;
    etaSecondary = eta.capped
      ? `Med hållbar takt (${rate}). ${CAPPED_NOTE}`
      : `Med nuvarande trend (${rate})`;
  } else if (eta?.kind === 'plan') {
    etaValue = `ca ${formatDate(eta.date)}`;
    etaSecondary = `Enligt plan (${formatRate(eta.rateKg)}) – ${PLAN_REASONS[eta.reason]}`;
  }
  if (eta && eta.kind !== 'reached' && profile.goalDate) {
    const late = eta.date > profile.goalDate;
    etaSecondary = `${etaSecondary ?? ''} · ${late ? 'efter' : 'i tid till'} måldatum ${formatDate(profile.goalDate)}`;
  }

  return (
    <Card title="Mot målet" testId="weight-details">
      <ul className="list">
        <ListRow
          primary="Förändring"
          secondary={`Från ${formatKg(profile.startWeightKg)}${onTrend ? ', räknat på trendvikten' : ''}`}
          value={
            <span data-testid="total-change">{formatKg(progress.changeKg, { signed: true })}</span>
          }
        />
        <ListRow
          primary="Kvar till mål"
          secondary={`Mål ${formatKg(profile.goalWeightKg)} · ${String(Math.round(progress.fraction * 100))} % av vägen`}
          value={
            <span data-testid="remaining">
              {progress.reached ? 'Målet nått!' : formatKg(progress.remainingKg)}
            </span>
          }
        />
        <ListRow
          primary="BMI"
          secondary={stats.bmi == null ? undefined : bmiCategory(stats.bmi)}
          value={<span data-testid="bmi">{stats.bmi == null ? '–' : formatBmi(stats.bmi)}</span>}
        />
        <ListRow
          primary="Målvikten nås"
          secondary={etaSecondary}
          value={<span data-testid="forecast">{etaValue}</span>}
        />
      </ul>
      <Disclosure summary="Hur räknas prognosen?" testId="forecast-explanation">
        <p>
          <ForecastExplanation />
        </p>
      </Disclosure>
    </Card>
  );
}
