import { useState } from 'react';
import { Card } from '../components/Card.tsx';
import { DoseChangeList } from '../components/DoseChangeList.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { Feature } from '../components/Feature.tsx';
import { RangeFilter } from '../components/RangeFilter.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { StepsHistory } from '../components/StepsHistory.tsx';
import { WaistHistory } from '../components/WaistHistory.tsx';
import { WaterHistory } from '../components/WaterHistory.tsx';
import { WeightChart } from '../components/WeightChart.tsx';
import { WeightDays } from '../components/WeightDays.tsx';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { formatMg } from '../lib/format.ts';
import { doseChanges } from '../lib/glp1.ts';
import { dailyWeights, emaTrend, filterRange, type RangeId } from '../lib/stats.ts';
import { useAppData } from '../lib/useAppData.ts';
import { drinkEntries, waterGoalFor } from '../lib/water.ts';

/**
 * Framsteg → Historik: viktgraf och -tabell, plus steg, midja och dryck när de är påslagna.
 * Med GLP-1 på markeras dosbyten i viktgrafen. Tidsfiltret gäller alla kort.
 */
export function Historik() {
  const { data } = useAppData();
  const features = useFeatures();
  const [range, setRange] = useState<RangeId>('3m');

  if (data === null) return <Skeleton cards={3} lines={3} />;

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
        <EmptyState
          title="Inga mätningar ännu"
          action={{ label: 'Logga vikt', href: '#/logga/vikt' }}
        >
          Viktgrafen och trenden visas här när du har vägt dig.
        </EmptyState>
      ) : daily.length === 0 ? (
        <EmptyState>Inga mätningar i vald period.</EmptyState>
      ) : (
        <Card title="Vikt" className="chart-card">
          <WeightChart
            daily={daily}
            trend={trend}
            goalKg={data.profile?.goalWeightKg ?? null}
            markers={changes.map((c) => ({ date: c.date, label: formatMg(c.doseMg) }))}
          />
        </Card>
      )}
      <DoseChangeList changes={changes} />
      <Feature id="steg">
        <StepsHistory steps={data.steps} range={range} today={today} />
      </Feature>
      <Feature id="midja">
        <WaistHistory key={range} waist={data.waist} range={range} today={today} />
      </Feature>
      <Feature id="vatten">
        <WaterHistory
          drinks={drinkEntries(data.water, data.foodLog)}
          goalOn={waterGoalFor({ profile: data.profile, workouts: data.workouts })}
          range={range}
          today={today}
        />
      </Feature>
      {daily.length > 0 && <WeightDays key={range} daily={daily} trendByDate={trendByDate} />}
    </>
  );
}
