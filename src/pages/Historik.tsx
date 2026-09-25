import { useState } from 'react';
import { EmptyState, Page } from '../components/Page.tsx';
import { RangeFilter } from '../components/RangeFilter.tsx';
import { WeightChart } from '../components/WeightChart.tsx';
import { todayIso } from '../lib/dates.ts';
import { formatDate, formatKg } from '../lib/format.ts';
import { dailyWeights, emaTrend, filterRange, type RangeId } from '../lib/stats.ts';
import { useAppData } from '../lib/useAppData.ts';

export function Historik() {
  const { data } = useAppData();
  const [range, setRange] = useState<RangeId>('3m');

  if (data === null) return <Page title="Historik" />;

  const allDaily = dailyWeights(data.weights);
  if (allDaily.length === 0) {
    return (
      <Page title="Historik">
        <EmptyState>Inga mätningar ännu.</EmptyState>
      </Page>
    );
  }

  // Trenden räknas på hela historiken så att filtret inte "nollställer" den.
  const today = todayIso();
  const daily = filterRange(allDaily, range, today);
  const trend = filterRange(emaTrend(allDaily), range, today);
  const trendByDate = new Map(trend.map((t) => [t.date, t.trendKg]));

  return (
    <Page title="Historik">
      <RangeFilter value={range} onChange={setRange} />
      {daily.length === 0 ? (
        <EmptyState>Inga mätningar i vald period.</EmptyState>
      ) : (
        <>
          <div className="card chart-card">
            <WeightChart daily={daily} trend={trend} goalKg={data.profile?.goalWeightKg ?? null} />
          </div>
          <section className="card" aria-labelledby="history-list-title">
            <h2 className="card-title" id="history-list-title">
              Dag för dag
            </h2>
            <table className="table" data-testid="history-table">
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col" className="num">
                    Vikt
                  </th>
                  <th scope="col" className="num">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map((d) => {
                  const t = trendByDate.get(d.date);
                  return (
                    <tr key={d.date}>
                      <td>{formatDate(d.date)}</td>
                      <td className="num">
                        {formatKg(d.weightKg)}
                        {d.count > 1 && (
                          <span className="muted-inline" title="Medel av flera mätningar">
                            {' '}
                            (×{d.count})
                          </span>
                        )}
                      </td>
                      <td className="num">{t == null ? '–' : formatKg(t)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </Page>
  );
}
