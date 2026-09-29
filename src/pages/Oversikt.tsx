import { useId, useState } from 'react';
import { EmptyState } from '../components/EmptyState.tsx';
import { Feature } from '../components/Feature.tsx';
import { HydrationReminder } from '../components/HydrationReminder.tsx';
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
import { formatKg, formatMonthYear, formatShortDate } from '../lib/format.ts';
import { goalEta, overviewStats, type GoalEta } from '../lib/overview.ts';
import { useOverviewItems } from '../lib/overviewItems.ts';
import { buildPlan } from '../lib/plan.ts';
import { usePreferences } from '../lib/preferences.ts';
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
            Börja med startvikt, längd och mål – sedan fylls Översikt med trend, dagens intag och
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

/** "mål ca feb. 2027" eller "mål ca feb. 2027 enligt plan". */
function etaText(eta: GoalEta): string {
  switch (eta.kind) {
    case 'reached':
      return 'Målet nått!';
    case 'trend':
      return `mål ca ${formatMonthYear(eta.date)}`;
    case 'plan':
      return `mål ca ${formatMonthYear(eta.date)} enligt plan`;
  }
}

/**
 * Viktkortet: trendvikten stort (eller dagsvikten), dagsvikt och datum på en rad, framsteg mot
 * målet och en rad "−X kg · Y kg kvar · mål ca [månad år]" – en enda måldatumsuppgift. Tryck på
 * kortet = Framsteg → Historik (graf, BMI, prognosens detaljer).
 */
function WeightCard({ profile, weights, foodLog, today }: WeightCardProps) {
  const daily = dailyWeights(weights);
  const { prefs } = usePreferences();
  // Alla härledda värden (förändring, kvar, prognos) räknas på samma vikt som huvudsiffran.
  const stats = overviewStats({ profile, daily, today, preferTrend: prefs.trendHero });
  const { progress, dailyKg: currentKg, trendKg, latestDate } = stats;
  const plan = buildPlan(profile, weights, foodLog, today);
  const eta = goalEta({
    stats,
    today,
    rateKg: profile.ratePerWeekKg,
    planDate: plan.kind === 'plan' ? plan.plan.forecastDate : null,
  });
  const trendHero = stats.source === 'trend' && trendKg != null && latestDate != null;

  return (
    <section className="card hero hero-card" data-testid="hero" aria-label="Vikt och mål">
      {trendHero ? (
        <>
          <TrendLabel />
          <p className="hero-value" data-testid="trend-weight">
            {formatKg(trendKg)}
          </p>
          <p className="hero-sub">
            Dagsvikt{' '}
            <span className="num" data-testid="current-weight">
              {formatKg(currentKg)}
            </span>{' '}
            · <span className="nowrap">{formatShortDate(latestDate)}</span>
          </p>
        </>
      ) : (
        <>
          <p className="hero-label">{latestDate ? 'Dagsvikt' : 'Startvikt'}</p>
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
        </>
      )}
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
            </>
          )}
        </p>
      </div>
      {/* Hela kortet är tryckytan (länkens ::after); info-knappen ligger ovanpå. */}
      <a className="hero-link" href="#/framsteg" data-testid="hero-link">
        <span className="visually-hidden">Visa vikthistorik</span>
      </a>
      <span className="list-row-chevron hero-chevron" aria-hidden="true" />
    </section>
  );
}

/** Rubriken "Trendvikt" med en info-knapp som fäller ut en kort förklaring. */
function TrendLabel() {
  const [open, setOpen] = useState(false);
  const infoId = useId();
  return (
    <>
      <p className="hero-label hero-label-info">
        Trendvikt
        <button
          type="button"
          className="info-button"
          aria-label="Vad är trendvikt?"
          aria-expanded={open}
          aria-controls={infoId}
          data-testid="trend-info"
          onClick={() => {
            setOpen((o) => !o);
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
          </svg>
        </button>
      </p>
      {open && (
        <p className="hero-info" id={infoId} data-testid="trend-info-text">
          Trendvikten är ett utjämnat snitt som varje dag rör sig ungefär 10 % mot dagens vikt. Den
          släpar efter i början men filtrerar bort vätskesvängningar – dagsvikten varierar normalt
          med vätska och salt, trenden visar den verkliga riktningen. Förändring, kvar till mål och
          prognos räknas på trendvikten.
        </p>
      )}
    </>
  );
}
