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
import { Card } from './Card.tsx';

interface NextDoseCardProps {
  data: AppData;
  now: Date;
}

function dayText(date: string, today: string): string {
  if (date === today) return 'Idag';
  if (date === addDays(today, 1)) return 'Imorgon';
  return formatDate(date);
}

/**
 * Logga → GLP-1 → Dos: nästa dos ur schemat och dostrappan, nästa steg i trappan, senaste dos och
 * förslag på ställe. Översikt visar samma nästa dos som en rad under Att göra idag.
 */
export function NextDoseCard({ data, now }: NextDoseCardProps) {
  const today = todayIso(now);
  const next = nextDose(data.medications, data.injections, now);
  const last = lastInjection(data.injections);
  const med = next ? data.medications.find((m) => m.id === next.medicationId) : undefined;
  const upcomingStep = med && next ? nextDoseStep(med, next.date) : null;

  return (
    <Card title="Nästa dos" testId="next-dose">
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
        <dl className="stats stats-compact stats-2">
          {last && (
            <div className="stat">
              <dt>Senaste dos</dt>
              <dd data-testid="last-dose">
                {formatDate(last.date)} · {describeDose(last)}
                {last.site ? ` · ${siteLabel(last.site)}` : ''}
              </dd>
            </div>
          )}
          <div className="stat">
            <dt>Förslag på ställe</dt>
            <dd data-testid="next-site">{siteLabel(suggestSite(data.injections))}</dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
