import { dueToday, describeDose } from '../lib/glp1.ts';
import type { AppData } from '../lib/useAppData.ts';

interface DoseDayBannerProps {
  data: AppData;
  now: Date;
}

/** Överst på Översikt: idag är dosdag och dosen är inte loggad. */
export function DoseDayBanner({ data, now }: DoseDayBannerProps) {
  const due = dueToday(data.medications, data.injections, now);
  if (due.length === 0) return null;
  return (
    <aside className="banner" aria-labelledby="dose-day-title" data-testid="dose-day-banner">
      <p className="banner-title" id="dose-day-title">
        Dosdag idag
      </p>
      <p className="banner-text">
        {due.map((d) => `${describeDose(d)} kl. ${d.time ?? ''}`.trim()).join(', ')}{' '}
        {due.length === 1 ? 'är inte loggad' : 'är inte loggade'} än.
      </p>
      <a className="button button-small" href="#/logga/glp1">
        Logga dos
      </a>
    </aside>
  );
}
