import { useState } from 'react';
import { DoseChangeList } from '../components/DoseChangeList.tsx';
import { Feature } from '../components/Feature.tsx';
import { EmptyState } from '../components/Page.tsx';
import { RangeFilter } from '../components/RangeFilter.tsx';
import { StepsHistory } from '../components/StepsHistory.tsx';
import { WaistHistory } from '../components/WaistHistory.tsx';
import { WaterHistory } from '../components/WaterHistory.tsx';
import { WeightChart } from '../components/WeightChart.tsx';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { formatDate, formatKg, formatMg } from '../lib/format.ts';
import { doseChanges } from '../lib/glp1.ts';
import { dailyWeights, emaTrend, filterRange, type RangeId } from '../lib/stats.ts';
import { useAppData } from '../lib/useAppData.ts';
import { drinkEntries, waterGoalFor } from '../lib/water.ts';

/**
 * Framsteg → Historik: viktgraf och -tabell, plus steg, midja och dryck när de är påslagna.
 * Med GLP-1 på markeras dosbyten i viktgrafen.
 */
export function Historik() {
  const { data } = useAppData();
  const features = useFeatures();
  const [range, setRange] = useState<RangeId>('3m');

  if (data === null) return null;

  // Trenden räknas på hela historiken så att filtret inte "nollställer" den.
  const today = todayIso();
  const allDaily = dailyWeights(data.weights);
  const daily = filterRange(allDaily, range, today);
  const trend = filterRange(emaTrend(allDaily), range, today);
  const trendByDate = new Map(trend.map((t) => [t.date, t.trendKg]));
  const first = daily[0]?.date ?? today;
  const changes = features.isEnabled('glp1')
    ? doseChanges(data.injections).filter((c) => c.date >= first && c.date <= today)
    : [];

  return (
    <>
      <RangeFilter value={range} onChange={setRange} />
      {allDaily.length === 0 ? (
        <EmptyState>Inga mätningar ännu.</EmptyState>
      ) : daily.length === 0 ? (
        <EmptyState>Inga mätningar i vald period.</EmptyState>
      ) : (
        <div className="card chart-card">
          <WeightChart
            daily={daily}
            trend={trend}
            goalKg={data.profile?.goalWeightKg ?? null}
            markers={changes.map((c) => ({ date: c.date, label: formatMg(c.doseMg) }))}
          />
        </div>
      )}
      <DoseChangeList changes={changes} />
      <Feature id="steg">
        <StepsHistory steps={data.steps} range={range} today={today} />
      </Feature>
      <Feature id="midja">
        <WaistHistory waist={data.waist} range={range} today={today} />
      </Feature>
      <Feature id="vatten">
        <WaterHistory
          drinks={drinkEntries(data.water, data.foodLog)}
          goalOn={waterGoalFor({ profile: data.profile, workouts: data.workouts })}
          range={range}
          today={today}
        />
      </Feature>
      {daily.length > 0 && (
        <section className="card" aria-labelledby="history-list-title">
          <h2 className="card-title" id="history-list-title">
            Vikt dag för dag
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
      )}
    </>
  );
}
