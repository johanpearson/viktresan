import type { ReactNode } from 'react';
import { BackupReminder } from '../components/BackupReminder.tsx';
import { CaloriePlanCard } from '../components/CaloriePlanCard.tsx';
import { DoseDayBanner } from '../components/DoseDayBanner.tsx';
import { Feature } from '../components/Feature.tsx';
import { MissedWorkouts } from '../components/MissedWorkouts.tsx';
import { NavIcon } from '../components/NavIcon.tsx';
import { NextDoseCard } from '../components/NextDoseCard.tsx';
import { Card } from '../components/Card.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { ListRow } from '../components/ListRow.tsx';
import { Page } from '../components/Page.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { TodayCard } from '../components/TodayCard.tsx';
import { UpcomingCard } from '../components/UpcomingCard.tsx';
import { WeekSummaryCard } from '../components/WeekSummaryCard.tsx';
import type { FoodLogEntry, Profile, WeightEntry } from '../db/db.ts';
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
import { buildPlan } from '../lib/plan.ts';
import { usePreferences } from '../lib/preferences.ts';
import { useAppData } from '../lib/useAppData.ts';

export function Oversikt() {
  const { data, reload } = useAppData();
  const now = new Date();
  return (
    <Page
      title="Översikt"
      action={
        <a className="icon-link" href="#/installningar" aria-label="Inställningar">
          <NavIcon id="installningar" />
        </a>
      }
    >
      {data === null && <Skeleton hero cards={3} />}
      {data && (
        <Feature id="glp1">
          <DoseDayBanner data={data} now={now} />
        </Feature>
      )}
      {data && (
        <Feature id="traning">
          <MissedWorkouts data={data} now={now} onChange={reload} />
        </Feature>
      )}
      <BackupReminder />
      {data === null ? null : data.profile === null ? (
        <EmptyState
          title="Välkommen till Viktresan"
          action={{ label: 'Fyll i profilen', href: '#/installningar/profil' }}
        >
          Börja med startvikt, längd och mål – sedan fylls Översikt med trend, dagens intag och
          prognos.
        </EmptyState>
      ) : (
        <Summary
          profile={data.profile}
          weights={data.weights}
          foodLog={data.foodLog}
          week={<WeekSummaryCard data={data} now={now} />}
        >
          <TodayCard data={data} now={now} onChange={reload} />
          <Feature id="glp1">
            <NextDoseCard data={data} now={now} />
          </Feature>
          <Feature id="traning">
            <UpcomingCard data={data} now={now} onChange={reload} />
          </Feature>
        </Summary>
      )}
    </Page>
  );
}

interface SummaryProps {
  profile: Profile;
  weights: WeightEntry[];
  foodLog: FoodLogEntry[];
  /** Förra veckans summering (visas efter Idag). */
  week?: ReactNode;
  /** Visas direkt under huvudsiffran (Idag, Nästa dos, Kommande). */
  children?: ReactNode;
}

/** Så många veckor visas i "Snitt per vecka" (resten finns under Framsteg). */
const WEEKS_SHOWN = 4;

function Summary({ profile, weights, foodLog, week, children }: SummaryProps) {
  const today = todayIso();
  const daily = dailyWeights(weights);
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
  const plan = buildPlan(profile, weights, foodLog, today);
  const { prefs } = usePreferences();
  const trendHero = prefs.trendHero && latest !== undefined && trendKg != null;

  return (
    <>
      {/* Huvudkortet: vikten, vägen mot målet, nyckeltal och prognos. */}
      <section className="card hero" data-testid="hero" aria-label="Vikt och mål">
        {trendHero ? (
          <>
            <p className="hero-label">Trendvikt</p>
            <p className="hero-value" data-testid="trend-weight">
              {formatKg(trendKg)}
            </p>
            <p className="hero-sub">
              Dagsvikt{' '}
              <span className="num" data-testid="current-weight">
                {formatKg(currentKg)}
              </span>
              <span className="muted"> · {formatDate(latest.date)}</span>
            </p>
            <p className="hero-note" data-testid="trend-note">
              Dagsvikten varierar normalt med vätska och salt – trenden visar den verkliga
              riktningen.
            </p>
          </>
        ) : (
          <>
            <p className="hero-label">Nuvarande vikt</p>
            <p className="hero-value" data-testid="current-weight">
              {formatKg(currentKg)}
            </p>
            <p className="hero-note">
              {latest
                ? `Senast loggad ${formatDate(latest.date)}`
                : 'Startvikt – ingen mätning ännu'}
              {trendKg != null && daily.length > 1 ? ` · Trend ${formatKg(trendKg)}` : ''}
            </p>
          </>
        )}
        <div className="hero-progress">
          <ProgressBar
            thin
            tone="weight"
            fraction={progress.fraction}
            label="Framsteg mot målvikten"
          />
          <p className="progress-caption">
            <span className="num">{Math.round(progress.fraction * 100)} %</span> av vägen från{' '}
            <span className="num">{formatKg(profile.startWeightKg)}</span> till{' '}
            <span className="num">{formatKg(profile.goalWeightKg)}</span>
            {profile.goalDate ? ` till ${formatDate(profile.goalDate)}` : ''}
          </p>
        </div>
        <dl className="stats stats-compact">
          <div className="stat">
            <dt>Förändring</dt>
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
              {bmiValue == null ? (
                '–'
              ) : (
                <>
                  <span className="num">{formatBmi(bmiValue)}</span>{' '}
                  <span className="stat-sub">({bmiCategory(bmiValue)})</span>
                </>
              )}
            </dd>
          </div>
        </dl>
        <p className="hero-forecast" data-testid="forecast">
          {forecastText(forecast, progress.reached)}
        </p>
      </section>

      {children}
      {week}

      <Feature id="mat">
        <CaloriePlanCard profile={profile} result={plan} />
      </Feature>

      <Card title="Snitt per vecka">
        <ul className="list" data-testid="weekly-averages">
          {[...weeks]
            .reverse()
            .slice(0, WEEKS_SHOWN)
            .map((w) => (
              <ListRow
                key={w.from}
                testId="week-average"
                primary={`${formatShortDate(w.from)} – ${formatShortDate(w.to)}`}
                secondary={w.days === 1 ? '1 dag' : `${String(w.days)} dagar`}
                value={w.averageKg == null ? '–' : formatKg(w.averageKg)}
              />
            ))}
        </ul>
      </Card>
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
