import type { ReactNode } from 'react';
import type { PhotoSession } from '../db/db.ts';
import {
  formatBmi,
  formatCm,
  formatDate,
  formatInt,
  formatKcal,
  formatKg,
  formatShortDate,
} from '../lib/format.ts';
import { formatPerWeek } from '../lib/plateau.ts';
import { doseRowText, type Report, type ReportSectionId } from '../lib/report.ts';
import { isoWeekNumber } from '../lib/weekSummary.ts';
import type { PhotoItem } from '../lib/usePhotos.ts';
import { Card } from './Card.tsx';
import { ListRow } from './ListRow.tsx';
import { Parts } from './Parts.tsx';
import { SvgChart } from './SvgChart.tsx';

export interface ReportPhoto {
  session: PhotoSession;
  photo: PhotoItem | null;
}

interface ReportDocumentProps {
  report: Report;
  /** Sektionerna som ska med, i rapportens ordning (redan filtrerade på funktioner). */
  sections: readonly ReportSectionId[];
  /** Datum då rapporten skapades. */
  createdOn: string;
  photos?: readonly ReportPhoto[];
}

const pctFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

/** Axeletiketter: högst en decimal ("88,5"). */
function axis(value: number): string {
  return pctFormat.format(value).replace(/\s/g, ' ');
}

function signedPct(value: number): string {
  const text = pctFormat.format(Math.abs(value)).replace(/\s/g, ' ');
  const sign = Math.abs(value) < 0.05 ? '' : value < 0 ? '−' : '+';
  return `${sign}${text} %`;
}

function share(value: number): string {
  return `${String(Math.round(value * 100))} %`;
}

function days(n: number): string {
  return n === 1 ? '1 dag' : `${String(n)} dagar`;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="form-note muted">{children}</p>;
}

/**
 * Rapporten till vården som ett dokument: sidhuvud med period och datum, en sektion
 * per val (Card), grafer som SVG. Alltid ljust tema (`theme-light`); i utskrift A4,
 * en sektion per sida och sidhuvudet upprepat överst i varje sektion.
 */
export function ReportDocument({ report, sections, createdOn, photos = [] }: ReportDocumentProps) {
  const period = `${formatDate(report.from)} – ${formatDate(report.to)}`;
  const head = (
    <p className="report-running-head" aria-hidden="true">
      <span>Viktresan · rapport</span>
      <span>
        {period} · skapad {formatDate(createdOn)}
      </span>
    </p>
  );
  const range = `${formatShortDate(report.from)}–${formatShortDate(report.to)}`;

  function section(id: ReportSectionId, title: string, content: ReactNode) {
    return (
      <Card key={id} title={title} className="report-section" testId={`report-${id}`}>
        {head}
        {content}
      </Card>
    );
  }

  const render: Record<ReportSectionId, () => ReactNode> = {
    grunddata: () => {
      const b = report.basics;
      return section(
        'grunddata',
        'Grunddata',
        b === null ? (
          <Empty>Profilen är inte ifylld.</Empty>
        ) : (
          <ul className="list list-flush">
            <ListRow primary="Längd" value={formatCm(b.heightCm)} />
            <ListRow
              primary="Startvikt"
              secondary={formatDate(b.startDate)}
              value={formatKg(b.startWeightKg)}
            />
            <ListRow
              primary="Trendvikt"
              secondary={`Utjämnat snitt, ${formatDate(report.to)}`}
              value={formatKg(b.trendKg)}
            />
            <ListRow
              primary="Förändring sedan start"
              value={
                <span data-testid="report-change">
                  {formatKg(b.changeKg, { signed: true })} ({signedPct(b.changePct)})
                </span>
              }
            />
            {b.periodChangeKg !== null && (
              <ListRow
                primary="Förändring under perioden"
                secondary={range}
                value={formatKg(b.periodChangeKg, { signed: true })}
              />
            )}
            <ListRow
              primary="BMI"
              secondary={b.bmiCategory ?? undefined}
              value={b.bmi === null ? '–' : formatBmi(b.bmi)}
            />
            <ListRow primary="Målvikt" value={formatKg(b.goalWeightKg)} />
          </ul>
        ),
      );
    },
    vikt: () =>
      section(
        'vikt',
        'Vikt',
        report.weight.points.length === 0 ? (
          <Empty>Inga vägningar i perioden.</Empty>
        ) : (
          <>
            <SvgChart
              label={`Vikt ${range}: dagsvikter och trendlinje`}
              from={report.from}
              to={report.to}
              format={axis}
              series={[
                { label: 'Dagsvikt', tone: 'weight', kind: 'points', points: report.weight.points },
                { label: 'Trendvikt', tone: 'weight', kind: 'line', points: report.weight.trend },
              ]}
              testId="report-weight-chart"
            />
            <p className="form-note muted">
              Vägd {days(report.weight.weighDays)} av {String(report.days)}. Trendlinjen är ett
              utjämnat snitt som dämpar svängningar i vätska och salt.
            </p>
          </>
        ),
      ),
    midja: () =>
      section(
        'midja',
        'Midjemått',
        report.waist.entries.length === 0 ? (
          <Empty>Inga midjemått i perioden.</Empty>
        ) : (
          <>
            {report.waist.entries.length > 1 && (
              <SvgChart
                label={`Midjemått ${range}`}
                from={report.from}
                to={report.to}
                format={axis}
                series={[
                  {
                    label: 'Midjemått',
                    tone: 'waist',
                    kind: 'line-points',
                    points: report.waist.entries,
                  },
                ]}
              />
            )}
            <ul className="list list-flush">
              {report.waist.entries.map((w) => (
                <ListRow key={w.date} primary={formatDate(w.date)} value={formatCm(w.value)} />
              ))}
              {report.waist.changeCm !== null && (
                <ListRow
                  primary="Förändring"
                  value={`${report.waist.changeCm > 0 ? '+' : ''}${formatCm(report.waist.changeCm)}`}
                />
              )}
            </ul>
          </>
        ),
      ),
    glp1: () => {
      const g = report.glp1;
      if (g.medications.length === 0 && g.symptomDays === 0) {
        return section('glp1', 'GLP-1', <Empty>Ingen GLP-1-behandling i perioden.</Empty>);
      }
      return section(
        'glp1',
        'GLP-1',
        <>
          <ul className="list list-flush">
            {g.medications.map((m) => (
              <ListRow
                key={m.name}
                primary={m.name}
                secondary={m.ended ? `Avslutad ${formatDate(m.ended)}` : m.schedule}
              />
            ))}
            <ListRow
              primary="Tagna doser"
              secondary={
                g.scheduled > 0 ? `${String(g.scheduled)} schemalagda i perioden` : undefined
              }
              value={String(g.injections)}
            />
            <ListRow
              primary="Missade doser"
              secondary={
                g.missed.length > 0 ? (
                  <Parts text={g.missed.map((m) => formatShortDate(m.date)).join(' · ')} />
                ) : undefined
              }
              value={<span data-testid="report-missed">{String(g.missed.length)}</span>}
            />
          </ul>
          {g.timeline.length > 0 && (
            <table className="table" data-testid="report-dose-timeline">
              <caption className="report-caption">Dostidslinje</caption>
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Dos</th>
                  <th scope="col">Händelse</th>
                </tr>
              </thead>
              <tbody>
                {g.timeline.map((row) => (
                  <tr key={`${row.date}:${row.medicationName}:${String(row.doseMg)}`}>
                    <td className="nowrap">{formatShortDate(row.date)}</td>
                    <td className="nowrap">{doseRowText(row)}</td>
                    <td>
                      {row.kind === 'start'
                        ? 'Start'
                        : row.kind === 'byte'
                          ? 'Dosbyte'
                          : 'Gällande vid periodens början'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {g.appetite.length > 0 && (
            <>
              <h3 className="report-caption">Aptit (1 = ingen, 5 = stor)</h3>
              <SvgChart
                label={`Aptit ${range}, skala 1–5`}
                from={report.from}
                to={report.to}
                format={(v) => String(v)}
                yDomain={[1, 5]}
                integerTicks
                series={[{ label: 'Aptit', tone: 'mood', kind: 'line-points', points: g.appetite }]}
              />
            </>
          )}
          {g.sideEffects.length > 0 ? (
            <table className="table">
              <caption className="report-caption">
                Biverkningar ({days(g.symptomDays)} med registrerat mående)
              </caption>
              <thead>
                <tr>
                  <th scope="col">Biverkning</th>
                  <th scope="col" className="num">
                    Dagar
                  </th>
                </tr>
              </thead>
              <tbody>
                {g.sideEffects.map((e) => (
                  <tr key={e.name}>
                    <td>{e.name}</td>
                    <td className="num">{String(e.days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            g.symptomDays > 0 && <Empty>Inga biverkningar registrerade.</Empty>
          )}
        </>,
      );
    },
    kost: () => {
      const d = report.diet;
      return section(
        'kost',
        'Kost i snitt',
        d.foodDays === 0 ? (
          <Empty>Ingen mat loggad i perioden.</Empty>
        ) : (
          <>
            <ul className="list list-flush">
              <ListRow
                primary="Energi"
                value={d.kcal === null ? '–' : <span className="kcal">{formatKcal(d.kcal)}</span>}
              />
              <ListRow
                primary="Protein"
                secondary={
                  d.proteinGoalG === null ? undefined : `Mål ${formatInt(d.proteinGoalG)} g`
                }
                value={d.proteinG === null ? '–' : `${formatInt(Math.round(d.proteinG))} g`}
              />
              <ListRow
                primary="Fiber"
                secondary={
                  d.fiberG !== null && d.fiberCoverage < 0.95
                    ? `Känt för ${share(d.fiberCoverage)} av maten – troligen i underkant`
                    : undefined
                }
                value={d.fiberG === null ? '–' : `${formatInt(Math.round(d.fiberG))} g`}
              />
              <ListRow
                primary="Loggade dagar"
                value={
                  <span data-testid="report-food-days">
                    {String(d.foodDays)} av {String(report.days)} ({share(d.loggedShare)})
                  </span>
                }
              />
            </ul>
            <p className="form-note muted">
              Snitt per loggad dag.
              {d.estimatedEntries > 0
                ? ` ${String(d.estimatedEntries)} poster är uppskattade (snabblogg).`
                : ''}
            </p>
          </>
        ),
      );
    },
    tillskott: () =>
      section(
        'tillskott',
        'Tillskott',
        report.supplements.length === 0 ? (
          <Empty>Inga tillskott registrerade som tagna i perioden.</Empty>
        ) : (
          <ul className="list list-flush">
            {report.supplements.map((s) => (
              <ListRow
                key={s.name}
                primary={s.name}
                secondary={s.description ?? undefined}
                value={`${String(s.days)} av ${String(report.days)} dagar`}
              />
            ))}
          </ul>
        ),
      ),
    traning: () => {
      const t = report.training;
      return section(
        'traning',
        'Träning',
        <>
          <ul className="list list-flush">
            <ListRow
              primary="Genomförda pass"
              secondary={t.minutes > 0 ? `${formatInt(t.minutes)} minuter totalt` : undefined}
              value={String(t.done)}
            />
            <ListRow
              primary="Pass per vecka"
              value={<span data-testid="report-per-week">{formatPerWeek(t.perWeek)}</span>}
            />
          </ul>
          {t.done > 0 && (
            <table className="table">
              <caption className="report-caption">Per vecka</caption>
              <thead>
                <tr>
                  <th scope="col">Vecka</th>
                  <th scope="col" className="num">
                    Pass
                  </th>
                  <th scope="col" className="num">
                    Minuter
                  </th>
                </tr>
              </thead>
              <tbody>
                {t.weeks.map((w) => (
                  <tr key={w.from}>
                    <td className="nowrap">
                      v. {String(isoWeekNumber(w.from))}{' '}
                      <span className="muted-inline">{formatShortDate(w.from)}</span>
                    </td>
                    <td className="num">{String(w.count)}</td>
                    <td className="num">{formatInt(w.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>,
      );
    },
    steg: () => {
      const s = report.steps;
      return section(
        'steg',
        'Steg',
        s.average === null ? (
          <Empty>Inga steg loggade i perioden.</Empty>
        ) : (
          <>
            <ul className="list list-flush">
              <ListRow
                primary="Snitt per dag"
                secondary={`${days(s.days)} med steg`}
                value={formatInt(Math.round(s.average))}
              />
            </ul>
            <SvgChart
              label={`Steg per dag ${range}`}
              from={report.from}
              to={report.to}
              format={formatInt}
              series={[{ label: 'Steg', tone: 'steps', kind: 'bars', points: s.points }]}
            />
          </>
        ),
      );
    },
    bilder: () =>
      section(
        'bilder',
        'Bilder',
        photos.length === 0 ? (
          <Empty>Inga fototillfällen i perioden.</Empty>
        ) : (
          <ul className="report-photos">
            {photos.map(({ session, photo }) => (
              <li key={session.id}>
                {photo ? (
                  <img src={photo.url} alt={`Bild ${formatDate(session.date)}`} />
                ) : (
                  <span className="report-photo-missing">Ingen bild</span>
                )}
                <span className="report-photo-caption">
                  <Parts
                    text={[
                      formatDate(session.date),
                      session.weightKg === undefined ? null : formatKg(session.weightKg),
                    ]
                      .filter((p) => p !== null)
                      .join(' · ')}
                  />
                </span>
              </li>
            ))}
          </ul>
        ),
      ),
  };

  return (
    <article className="report theme-light" aria-labelledby="report-title" data-testid="report">
      <header className="report-header">
        <h2 id="report-title" className="report-title">
          Viktrapport
        </h2>
        <p className="report-period" data-testid="report-period">
          {period}
        </p>
        <p className="report-meta">
          Skapad {formatDate(createdOn)} i appen Viktresan. Egen loggning – inte en journalhandling.
        </p>
      </header>
      {sections.map((id) => render[id]())}
    </article>
  );
}
