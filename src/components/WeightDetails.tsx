import type { FoodLogEntry, Profile, WeightEntry } from '../db/db.ts';
import { formatBmi, formatDate, formatKg, formatRate } from '../lib/format.ts';
import { goalEta, overviewStats } from '../lib/overview.ts';
import { buildPlan } from '../lib/plan.ts';
import { usePreferences } from '../lib/preferences.ts';
import { bmiCategory, dailyWeights } from '../lib/stats.ts';
import { Card } from './Card.tsx';
import { ListRow } from './ListRow.tsx';

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
  const { progress, forecast } = stats;
  const onTrend = stats.source === 'trend';

  let etaValue = '–';
  let etaSecondary: string | undefined;
  if (eta?.kind === 'reached') etaValue = 'Nått';
  else if (eta?.kind === 'trend') {
    etaValue = `ca ${formatDate(eta.date)}`;
    etaSecondary = `Med nuvarande trend (${formatKg(eta.weeklyChangeKg, { signed: true })}/vecka)`;
  } else if (eta?.kind === 'plan') {
    etaValue = `ca ${formatDate(eta.date)}`;
    etaSecondary = `Enligt plan (${formatRate(eta.rateKg)})${
      forecast.kind === 'not-progressing' ? ' – trenden leder inte mot målet just nu' : ''
    }`;
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
    </Card>
  );
}
