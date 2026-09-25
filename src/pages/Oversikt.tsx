import { EmptyState, Page } from '../components/Page.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import type { Measurement, Profile } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatBmi, formatDate, formatKg, formatShortDate } from '../lib/format.ts';
import {
  bmi,
  bmiCategory,
  dailyWeights,
  emaTrend,
  forecastGoal,
  goalProgress,
  weeklyAverages,
  type GoalForecast,
} from '../lib/stats.ts';
import { useAppData } from '../lib/useAppData.ts';

export function Oversikt() {
  const { data } = useAppData();
  return (
    <Page title="Översikt">
      {data === null ? null : data.profile === null ? (
        <EmptyState>
          Börja med att fylla i din profil under <a href="#/installningar">Inställningar</a> –
          startvikt, längd och mål.
        </EmptyState>
      ) : (
        <Summary profile={data.profile} measurements={data.measurements} />
      )}
    </Page>
  );
}

function Summary({ profile, measurements }: { profile: Profile; measurements: Measurement[] }) {
  const today = todayIso();
  const daily = dailyWeights(measurements);
  const latest = daily[daily.length - 1];
  const currentKg = latest?.weightKg ?? profile.startWeightKg;
  const trend = emaTrend(daily);
  const trendKg = trend[trend.length - 1]?.trendKg;
  const progress = goalProgress(profile.startWeightKg, currentKg, profile.goalWeightKg);
  const bmiValue = bmi(currentKg, profile.heightCm);
  const weeks = weeklyAverages(daily, today);
  const forecast = forecastGoal({
    daily,
    goalKg: profile.goalWeightKg,
    today,
    goalDate: profile.goalDate,
  });

  return (
    <>
      <div className="card hero">
        <p className="hero-label">Nuvarande vikt</p>
        <p className="hero-value" data-testid="current-weight">
          {formatKg(currentKg)}
        </p>
        <p className="muted hero-meta">
          {latest ? `Senast loggad ${formatDate(latest.date)}` : 'Startvikt – ingen mätning ännu'}
          {trendKg != null && daily.length > 1 ? ` · Trend ${formatKg(trendKg)}` : ''}
        </p>
      </div>

      <div className="card">
        <dl className="stats">
          <div className="stat">
            <dt>Total förändring</dt>
            <dd data-testid="total-change">{formatKg(progress.changeKg, { signed: true })}</dd>
          </div>
          <div className="stat">
            <dt>Kvar till mål</dt>
            <dd data-testid="remaining">
              {progress.reached ? 'Målet nått!' : formatKg(progress.remainingKg)}
            </dd>
          </div>
          <div className="stat">
            <dt>BMI</dt>
            <dd data-testid="bmi">
              {bmiValue == null ? '–' : `${formatBmi(bmiValue)} (${bmiCategory(bmiValue)})`}
            </dd>
          </div>
          <div className="stat">
            <dt>Mål</dt>
            <dd>
              {formatKg(profile.goalWeightKg)}
              {profile.goalDate ? ` till ${formatDate(profile.goalDate)}` : ''}
            </dd>
          </div>
        </dl>
        <ProgressBar fraction={progress.fraction} label="Framsteg mot målvikten" />
        <p className="progress-caption">
          {Math.round(progress.fraction * 100)} % av vägen från {formatKg(profile.startWeightKg)}{' '}
          till {formatKg(profile.goalWeightKg)}
        </p>
      </div>

      <section className="card" aria-labelledby="weeks-title">
        <h2 className="card-title" id="weeks-title">
          Snitt per vecka
        </h2>
        <table className="table" data-testid="weekly-averages">
          <thead>
            <tr>
              <th scope="col">Vecka</th>
              <th scope="col" className="num">
                Snitt
              </th>
              <th scope="col" className="num">
                Dagar
              </th>
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((w) => (
              <tr key={w.from}>
                <td>
                  {formatShortDate(w.from)} – {formatShortDate(w.to)}
                </td>
                <td className="num">{w.averageKg == null ? '–' : formatKg(w.averageKg)}</td>
                <td className="num">{w.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" aria-labelledby="forecast-title">
        <h2 className="card-title" id="forecast-title">
          Prognos
        </h2>
        <p data-testid="forecast">{forecastText(forecast, progress.reached)}</p>
      </section>
    </>
  );
}

function forecastText(forecast: GoalForecast, reached: boolean): string {
  if (reached) return 'Du har nått din målvikt. Snyggt jobbat!';
  switch (forecast.kind) {
    case 'reached':
      return 'Trenden ligger på målvikten – håll i det!';
    case 'insufficient-data':
      return 'Logga några mätningar under minst en vecka så visas en prognos här.';
    case 'not-progressing':
      return `Trenden (${formatKg(forecast.weeklyChangeKg, { signed: true })}/vecka) leder inte mot målet just nu.`;
    case 'forecast': {
      const base = `Med nuvarande trend (${formatKg(forecast.weeklyChangeKg, { signed: true })}/vecka) når du målet omkring ${formatDate(forecast.date)}.`;
      if (forecast.daysVsGoalDate == null) return base;
      if (forecast.daysVsGoalDate <= 0) return `${base} Det är i tid till ditt måldatum.`;
      return `${base} Det är ${forecast.daysVsGoalDate} dagar efter ditt måldatum.`;
    }
  }
}
