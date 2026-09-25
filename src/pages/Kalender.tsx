import { useMemo, useState } from 'react';
import { Page } from '../components/Page.tsx';
import {
  buildDayIndex,
  formatMonth,
  monthGrid,
  monthOf,
  shiftMonth,
  type DayLog,
} from '../lib/calendar.ts';
import { DAY_MARKERS, loggedValues } from '../lib/dayMarkers.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { formatDate } from '../lib/format.ts';
import { useAppData } from '../lib/useAppData.ts';
import { usePhotoDates } from '../lib/usePhotoDates.ts';

const WEEKDAYS: readonly [short: string, long: string][] = [
  ['M', 'måndag'],
  ['T', 'tisdag'],
  ['O', 'onsdag'],
  ['T', 'torsdag'],
  ['F', 'fredag'],
  ['L', 'lördag'],
  ['S', 'söndag'],
];

export function Kalender() {
  const { data } = useAppData();
  const features = useFeatures();
  const markers = features.filter(DAY_MARKERS);
  const today = todayIso();
  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const photoDates = usePhotoDates();
  const days = useMemo(
    () => (data ? buildDayIndex({ ...data, photoDates }) : new Map<string, DayLog>()),
    [data, photoDates],
  );

  function loggedOn(date: string) {
    return loggedValues(markers, days.get(date));
  }

  const selectedLog = loggedOn(selected);

  return (
    <Page title="Kalender">
      <section className="card calendar" aria-labelledby="calendar-month">
        <div className="calendar-header">
          <button
            type="button"
            className="button button-secondary button-small calendar-nav"
            aria-label="Föregående månad"
            onClick={() => {
              setMonth((m) => shiftMonth(m, -1));
            }}
          >
            ‹
          </button>
          <h2 className="card-title calendar-title" id="calendar-month" aria-live="polite">
            {formatMonth(month)}
          </h2>
          <button
            type="button"
            className="button button-secondary button-small calendar-nav"
            aria-label="Nästa månad"
            disabled={month >= monthOf(today)}
            onClick={() => {
              setMonth((m) => shiftMonth(m, 1));
            }}
          >
            ›
          </button>
        </div>
        <table className="calendar-grid" data-testid="calendar">
          <thead>
            <tr>
              {WEEKDAYS.map(([short, long]) => (
                <th key={long} scope="col" abbr={long}>
                  {short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthGrid(month).map((week) => (
              <tr key={week.find((d) => d != null) ?? ''}>
                {week.map((date, i) => {
                  if (date == null) return <td key={`tom-${String(i)}`} />;
                  const logged = loggedOn(date);
                  const label =
                    logged.length === 0
                      ? `${formatDate(date)}, inget loggat`
                      : `${formatDate(date)}: ${logged.map((l) => l.marker.label).join(', ')}`;
                  return (
                    <td key={date}>
                      <button
                        type="button"
                        className="calendar-day"
                        aria-label={label}
                        aria-pressed={date === selected}
                        aria-current={date === today ? 'date' : undefined}
                        data-date={date}
                        onClick={() => {
                          setSelected(date);
                        }}
                      >
                        <span className="calendar-day-number" aria-hidden="true">
                          {Number(date.slice(8))}
                        </span>
                        <span className="calendar-dots" aria-hidden="true">
                          {logged.map(({ marker }) => (
                            <span
                              key={marker.id}
                              className={`calendar-dot dot-${marker.id}`}
                              data-marker={marker.id}
                            />
                          ))}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="calendar-legend" aria-label="Förklaring">
          {markers.map((m) => (
            <li key={m.id}>
              <span className={`calendar-dot dot-${m.id}`} aria-hidden="true" />
              {m.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="calendar-day-title" data-testid="calendar-day">
        <h2 className="card-title" id="calendar-day-title">
          {formatDate(selected)}
        </h2>
        {selectedLog.length === 0 ? (
          <p className="muted">Inget loggat den här dagen.</p>
        ) : (
          <dl className="kv">
            {selectedLog.map(({ marker, value }) => (
              <div key={marker.id} data-testid={`calendar-value-${marker.id}`}>
                <dt>{marker.label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </Page>
  );
}
