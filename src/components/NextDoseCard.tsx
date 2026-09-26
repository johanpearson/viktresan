import { addDays, todayIso } from '../lib/dates.ts';
import { formatDate, formatMg } from '../lib/format.ts';
import {
  describeDose,
  lastInjection,
  nextDose,
  nextDoseStep,
  siteLabel,
  suggestSite,
} from '../lib/glp1.ts';
import type { AppData } from '../lib/useAppData.ts';

interface NextDoseCardProps {
  data: AppData;
  now: Date;
}

function dayText(date: string, today: string): string {
  if (date === today) return 'Idag';
  if (date === addDays(today, 1)) return 'Imorgon';
  return formatDate(date);
}

/** Översikt → Nästa dos: datum och dos ur schemat och dostrappan, senaste dos och ställe. */
export function NextDoseCard({ data, now }: NextDoseCardProps) {
  const today = todayIso(now);
  const next = nextDose(data.medications, data.injections, now);
  const last = lastInjection(data.injections);
  const med = next ? data.medications.find((m) => m.id === next.medicationId) : undefined;
  const upcomingStep = med && next ? nextDoseStep(med, next.date) : null;

  return (
    <section className="card" aria-labelledby="next-dose-title" data-testid="next-dose">
      <h2 className="card-title" id="next-dose-title">
        Nästa dos
      </h2>
      {data.medications.length === 0 ? (
        <p className="form-note">
          Lägg in ditt läkemedel och din dostrappa under <a href="#/logga/glp1">Logga → GLP-1</a>.
        </p>
      ) : next === null ? (
        <p className="form-note">Ingen planerad dos de närmaste veckorna.</p>
      ) : (
        <>
          <p className="dose-next" data-testid="next-dose-value">
            {dayText(next.date, today)}
            {next.time ? ` ${next.time}` : ''} · {describeDose(next)}
          </p>
          {upcomingStep && (
            <p className="form-note">
              Nästa steg i dostrappan: {formatMg(upcomingStep.doseMg)} från{' '}
              {formatDate(upcomingStep.date)}.
            </p>
          )}
        </>
      )}
      {data.medications.length > 0 && (
        <dl className="kv">
          {last && (
            <div>
              <dt>Senaste dos</dt>
              <dd data-testid="last-dose">
                {formatDate(last.date)} · {describeDose(last)}
                {last.site ? ` · ${siteLabel(last.site)}` : ''}
              </dd>
            </div>
          )}
          <div>
            <dt>Förslag på ställe</dt>
            <dd data-testid="next-site">{siteLabel(suggestSite(data.injections))}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
