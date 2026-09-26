import { useState } from 'react';
import { Page } from '../components/Page.tsx';
import { WorkoutList } from '../components/WorkoutList.tsx';
import {
  buildDayIndex,
  formatMonth,
  monthGrid,
  monthOf,
  monthRange,
  shiftMonth,
  weekOf,
  type DayLog,
} from '../lib/calendar.ts';
import { DAY_MARKERS, loggedValues, type DayMarker } from '../lib/dayMarkers.ts';
import { addDays, todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { formatDate, formatShortDate } from '../lib/format.ts';
import { useAppData } from '../lib/useAppData.ts';
import { usePhotoDates } from '../lib/usePhotoDates.ts';
import { DISPLAY_STATUS_LABELS, workoutsBetween, type DisplayStatus } from '../lib/workouts.ts';

const WEEKDAYS: readonly [short: string, long: string][] = [
  ['M', 'måndag'],
  ['T', 'tisdag'],
  ['O', 'onsdag'],
  ['T', 'torsdag'],
  ['F', 'fredag'],
  ['L', 'lördag'],
  ['S', 'söndag'],
];

const STATUS_LEGEND: readonly DisplayStatus[] = ['genomford', 'hoppad', 'obesvarad', 'planerad'];

type View = 'manad' | 'vecka';

const weekdayFormat = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', timeZone: 'UTC' });

function weekdayName(iso: string): string {
  return weekdayFormat.format(new Date(`${iso}T12:00:00Z`));
}

function min(a: string, b: string): string {
  return a < b ? a : b;
}

function max(a: string, b: string): string {
  return a > b ? a : b;
}

/** Prickar för en dag: en per markör, eller en per post (t.ex. pass med status). */
function Dots({ markers, day }: { markers: readonly DayMarker[]; day: DayLog | undefined }) {
  return (
    <span className="calendar-dots" aria-hidden="true">
      {loggedValues(markers, day).flatMap(({ marker }) =>
        (marker.dots && day ? marker.dots(day) : ['']).map((extra, i) => (
          <span
            key={`${marker.id}-${String(i)}`}
            className={`calendar-dot dot-${marker.id} ${extra}`.trim()}
            data-marker={marker.id}
          />
        )),
      )}
    </span>
  );
}

export function Kalender() {
  const { data, reload } = useAppData();
  const features = useFeatures();
  const markers = features.filter(DAY_MARKERS);
  const now = new Date();
  const today = todayIso(now);
  const [view, setView] = useState<View>('manad');
  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const photoDates = usePhotoDates();

  const week = weekOf(selected);
  const range =
    view === 'manad' ? monthRange(month) : { from: week[0] ?? selected, to: week[6] ?? selected };
  // Den valda dagen kan ligga utanför det som visas (efter byte av månad).
  const from = min(range.from, selected);
  const to = max(range.to, selected);

  const days = data
    ? buildDayIndex({
        ...data,
        photoDates,
        workouts: workoutsBetween(data.workouts, data.workoutPlans, from, to),
        now,
      })
    : new Map<string, DayLog>();

  function loggedOn(date: string) {
    return loggedValues(markers, days.get(date));
  }

  function dayLabel(date: string): string {
    const logged = loggedOn(date);
    return logged.length === 0
      ? `${formatDate(date)}, inget loggat`
      : `${formatDate(date)}: ${logged.map((l) => l.marker.label).join(', ')}`;
  }

  function select(date: string) {
    setSelected(date);
    setMonth(monthOf(date));
  }

  const selectedDay = days.get(selected);
  const selectedLog = loggedOn(selected).filter((l) => l.marker.id !== 'traning');
  const showWorkouts = features.isEnabled('traning');
  const selectedWorkouts = showWorkouts ? (selectedDay?.workouts ?? []).map((w) => w.item) : [];

  return (
    <Page title="Kalender">
      <div className="segmented" role="group" aria-label="Vy">
        <button
          type="button"
          className="segmented-button"
          aria-pressed={view === 'manad'}
          onClick={() => {
            setView('manad');
          }}
        >
          Månad
        </button>
        <button
          type="button"
          className="segmented-button"
          aria-pressed={view === 'vecka'}
          onClick={() => {
            setView('vecka');
          }}
        >
          Vecka
        </button>
      </div>
      <section className="card calendar" aria-labelledby="calendar-period">
        <div className="calendar-header">
          <button
            type="button"
            className="button button-secondary button-small calendar-nav"
            aria-label={view === 'manad' ? 'Föregående månad' : 'Föregående vecka'}
            onClick={() => {
              if (view === 'manad') setMonth((m) => shiftMonth(m, -1));
              else select(addDays(selected, -7));
            }}
          >
            ‹
          </button>
          <h2 className="card-title calendar-title" id="calendar-period" aria-live="polite">
            {view === 'manad'
              ? formatMonth(month)
              : `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`}
          </h2>
          <button
            type="button"
            className="button button-secondary button-small calendar-nav"
            aria-label={view === 'manad' ? 'Nästa månad' : 'Nästa vecka'}
            onClick={() => {
              if (view === 'manad') setMonth((m) => shiftMonth(m, 1));
              else select(addDays(selected, 7));
            }}
          >
            ›
          </button>
        </div>
        {view === 'manad' ? (
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
              {monthGrid(month).map((w) => (
                <tr key={w.find((d) => d != null) ?? ''}>
                  {w.map((date, i) => {
                    if (date == null) return <td key={`tom-${String(i)}`} />;
                    return (
                      <td key={date}>
                        <button
                          type="button"
                          className="calendar-day"
                          aria-label={dayLabel(date)}
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
                          <Dots markers={markers} day={days.get(date)} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="week-list" data-testid="calendar-week">
            {week.map((date) => {
              const logged = loggedOn(date);
              return (
                <li key={date}>
                  <button
                    type="button"
                    className="week-day"
                    aria-label={dayLabel(date)}
                    aria-pressed={date === selected}
                    aria-current={date === today ? 'date' : undefined}
                    data-date={date}
                    onClick={() => {
                      setSelected(date);
                    }}
                  >
                    <span className="week-day-name" aria-hidden="true">
                      <span className="week-day-weekday">{weekdayName(date)}</span>
                      <span className="week-day-date">{formatShortDate(date)}</span>
                    </span>
                    <span className="week-day-body" aria-hidden="true">
                      <Dots markers={markers} day={days.get(date)} />
                      <span className="week-day-summary">
                        {logged.length === 0
                          ? '–'
                          : logged.map((l) => `${l.marker.label}: ${l.value}`).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <ul className="calendar-legend" aria-label="Förklaring">
          {markers.map((m) => (
            <li key={m.id}>
              <span className={`calendar-dot dot-${m.id}`} aria-hidden="true" />
              {m.label}
            </li>
          ))}
        </ul>
        {showWorkouts && (
          <ul className="calendar-legend" aria-label="Träningsstatus">
            {STATUS_LEGEND.map((status) => (
              <li key={status}>
                <span className={`calendar-dot dot-traning status-${status}`} aria-hidden="true" />
                {DISPLAY_STATUS_LABELS[status]}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="calendar-day-title" data-testid="calendar-day">
        <h2 className="card-title" id="calendar-day-title">
          {formatDate(selected)}
        </h2>
        {selectedLog.length === 0 && selectedWorkouts.length === 0 ? (
          <p className="muted">Inget loggat den här dagen.</p>
        ) : (
          selectedLog.length > 0 && (
            <dl className="kv">
              {selectedLog.map(({ marker, value }) => (
                <div key={marker.id} data-testid={`calendar-value-${marker.id}`}>
                  <dt>{marker.label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )
        )}
        {selectedWorkouts.length > 0 && (
          <>
            <h3 className="subheading">Träning</h3>
            <WorkoutList
              items={selectedWorkouts}
              mode="manage"
              now={now}
              onChange={reload}
              label="Dagens pass"
            />
          </>
        )}
      </section>
    </Page>
  );
}
