import { useMemo } from 'react';
import { buildDayIndex } from '../lib/calendar.ts';
import { DAY_MARKERS } from '../lib/dayMarkers.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import type { AppData } from '../lib/useAppData.ts';
import { usePhotoDates } from '../lib/usePhotoDates.ts';

/** Översikt → Idag: dagens värden för varje påslagen loggtyp. */
export function TodayCard({ data }: { data: AppData }) {
  const features = useFeatures();
  const photoDates = usePhotoDates();
  const today = todayIso();
  const day = useMemo(
    () => buildDayIndex({ ...data, photoDates }).get(today) ?? {},
    [data, photoDates, today],
  );

  return (
    <section className="card" aria-labelledby="today-title" data-testid="today-card">
      <h2 className="card-title" id="today-title">
        Idag
      </h2>
      <dl className="stats">
        {features.filter(DAY_MARKERS).map((marker) => (
          <div className="stat" key={marker.id} data-testid={`today-${marker.id}`}>
            <dt>{marker.label}</dt>
            <dd>{marker.value(day) ?? '–'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
