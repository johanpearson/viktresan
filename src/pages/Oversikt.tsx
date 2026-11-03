import { useId, useState } from 'react';
import { EmptyState } from '../components/EmptyState.tsx';
import { Feature } from '../components/Feature.tsx';
import { ForecastExplanation } from '../components/ForecastExplanation.tsx';
import { HydrationReminder } from '../components/HydrationReminder.tsx';
import { InfoButton } from '../components/InfoButton.tsx';
import { MilestoneCard } from '../components/MilestoneCard.tsx';
import { NavIcon } from '../components/NavIcon.tsx';
import { Page } from '../components/Page.tsx';
import { PlateauCard } from '../components/PlateauCard.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { TodayCard } from '../components/TodayCard.tsx';
import { TodayUpperLimits } from '../components/TodayUpperLimits.tsx';
import { TodoCard } from '../components/TodoCard.tsx';
import { UpdateCard } from '../components/UpdateCard.tsx';
import { WeekSummaryCard } from '../components/WeekSummaryCard.tsx';
import type { FoodLogEntry, Profile, WeightEntry } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { formatKg, formatMonthRange, formatMonthYear, formatShortDate } from '../lib/format.ts';
import { CAPPED_NOTE, goalEta, overviewStats, type GoalEta } from '../lib/overview.ts';
import { useOverviewItems } from '../lib/overviewItems.ts';
import { buildPlan } from '../lib/plan.ts';
import { dailyWeights } from '../lib/stats.ts';
import { useAppData } from '../lib/useAppData.ts';

/**
 * Översikt: status och det som kräver handling idag – viktkortet, kontextkort när de är aktuella
 * (ny version, milstolpe, veckosummering, platå, dryckespåminnelse, övre gränsvärden), Idag
 * (ringar, veckoraden, chips) och Att göra idag. Detaljer ligger ett tryck bort.
 */
export function Oversikt() {
  const { data, reload } = useAppData();
  const { shows } = useOverviewItems();
  const now = new Date();
  const today = todayIso(now);
  return (
    <Page
      title="Översikt"
      action={
        <a className="icon-link" href="#/installningar" aria-label="Inställningar">
          <NavIcon id="installningar" />
        </a>
      }
    >
      {data === null && <Skeleton hero cards={2} />}
      {data !== null && data.profile === null && (
        <>
          <UpdateCard />
          <EmptyState
            title="Välkommen till Viktresan"
            action={{ label: 'Fyll i profilen', href: '#/installningar/profil' }}
          >
            Börja med startvikt, längd och mål – sedan fylls Översikt med vikt, dagens intag och
            prognos.
          </EmptyState>
        </>
      )}
      {data?.profile && (
        <>
          <WeightCard
            profile={data.profile}
            weights={data.weights}
            foodLog={data.foodLog}
            today={today}
          />
          {/* Kontextkort: visas bara när de är aktuella och kan stängas. */}
          <UpdateCard />
          {shows('milstolpe') && <MilestoneCard now={now} />}
          {shows('veckosummering') && <WeekSummaryCard data={data} now={now} />}
          {shows('plata') && <PlateauCard data={data} now={now} />}
          <Feature id="glp1">
            <HydrationReminder symptoms={data.symptoms} today={today} />
          </Feature>
          <TodayUpperLimits data={data} today={today} />
          <TodayCard data={data} now={now} onChange={reload} />
          {shows('att-gora') && <TodoCard data={data} now={now} onChange={reload} />}
        </>
      )}
    </Page>
  );
}

interface WeightCardProps {
  profile: Profile;
  weights: WeightEntry[];
  foodLog: FoodLogEntry[];
  today: string;
}

/** "mål ca feb. 2027", "mål ca mars–maj 2027" (osäker takt) eller "mål ca feb. 2027 enligt plan". */
function etaText(eta: GoalEta): string {
  switch (eta.kind) {
    case 'reached':
      return 'Målet nått!';
    case 'forecast':
      return `mål ca ${eta.range ? formatMonthRange(eta.range.from, eta.range.to) : formatMonthYear(eta.date)}`;
    case 'plan':
      return `mål ca ${formatMonthYear(eta.date)} enligt plan`;
  }
}

/**
 * Viktkortet: senaste vikten stort med datum, framsteg mot målet och en rad "−X kg · Y kg kvar · mål ca [månad år]" – en enda måldatumsuppgift. Tryck på
 * kortet = Framsteg → Historik (graf, BMI, prognosens detaljer).
 */
function WeightCard({ profile, weights, foodLog, today }: WeightCardProps) {
  const daily = dailyWeights(weights);
  // Alla härledda värden (förändring, kvar, prognos) räknas på samma vikt som huvudsiffran.
  const stats = overviewStats({ profile, daily, today });
  const { progress, weightKg: currentKg, latestDate } = stats;
  const plan = buildPlan(profile, weights, foodLog, today);
  const eta = goalEta({
    stats,
    today,
    rateKg: profile.ratePerWeekKg,
    planDate: plan.kind === 'plan' ? plan.plan.forecastDate : null,
  });
  const [etaInfoOpen, setEtaInfoOpen] = useState(false);
  const etaInfoId = useId();

  return (
    <section className="card hero hero-card" data-testid="hero" aria-label="Vikt och mål">
      <p className="hero-label">{latestDate ? 'Vikt' : 'Startvikt'}</p>
      <p className="hero-value" data-testid="current-weight">
        {formatKg(currentKg)}
      </p>
      <p className="hero-sub">
        {latestDate ? (
          <>
            Senast loggad <span className="nowrap">{formatShortDate(latestDate)}</span>
          </>
        ) : (
          'Ingen vägning ännu'
        )}
      </p>
      <div className="hero-progress">
        <ProgressBar
          thin
          tone="weight"
          fraction={progress.fraction}
          label="Framsteg mot målvikten"
        />
        <p className="progress-caption hero-summary" data-testid="hero-summary">
          <span className="nowrap" data-testid="hero-change">
            {formatKg(progress.changeKg, { signed: true })}
          </span>
          {!progress.reached && (
            <>
              {' · '}
              <span className="nowrap" data-testid="hero-remaining">
                {formatKg(progress.remainingKg)} kvar
              </span>
            </>
          )}
          {eta && (
            <>
              {' · '}
              <span className="nowrap" data-testid="goal-eta" data-kind={eta.kind}>
                {etaText(eta)}
              </span>
              {eta.kind !== 'reached' && (
                <InfoButton
                  label="Hur räknas prognosen?"
                  expanded={etaInfoOpen}
                  controls={etaInfoId}
                  testId="eta-info"
                  onToggle={() => {
                    setEtaInfoOpen((o) => !o);
                  }}
                />
              )}
            </>
          )}
        </p>
        {eta?.kind === 'forecast' && eta.capped && (
          <p className="hero-sub" data-testid="goal-eta-capped">
            {CAPPED_NOTE}
          </p>
        )}
        {etaInfoOpen && (
          <p className="hero-info" id={etaInfoId} data-testid="eta-info-text">
            <ForecastExplanation />
          </p>
        )}
      </div>
      {/* Hela kortet är tryckytan (länkens ::after); info-knappen ligger ovanpå. */}
      <a className="hero-link" href="#/framsteg" data-testid="hero-link">
        <span className="visually-hidden">Visa vikthistorik</span>
      </a>
      <span className="list-row-chevron hero-chevron" aria-hidden="true" />
    </section>
  );
}
