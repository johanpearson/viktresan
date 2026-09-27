import { useState } from 'react';
import { FoodDay } from '../components/FoodDay.tsx';
import { IntakeHistory } from '../components/IntakeHistory.tsx';
import { OwnFoods } from '../components/OwnFoods.tsx';
import { Page } from '../components/Page.tsx';
import { todayIso } from '../lib/dates.ts';
import { buildPlan } from '../lib/plan.ts';
import { proteinGoalFor } from '../lib/protein.ts';
import { useAppData } from '../lib/useAppData.ts';
import { useFoodData } from '../lib/useFoodData.ts';
import { useHashRoute } from '../lib/useHashRoute.ts';

type Tab = 'dag' | 'egna' | 'historik';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'dag', label: 'Dag' },
  { id: 'egna', label: 'Egna' },
  { id: 'historik', label: 'Historik' },
];

export function Mat() {
  const { data, reload } = useAppData();
  const food = useFoodData();
  const [tab, setTab] = useState<Tab>('dag');
  // "#/mat/logga" (genvägen "Logga mat") öppnar sök-sheeten direkt.
  const { sub } = useHashRoute();
  const [initialPicker] = useState(() => sub === 'logga');

  const plan =
    data?.profile != null ? buildPlan(data.profile, data.weights, data.foodLog, todayIso()) : null;
  const targetKcal = plan?.kind === 'plan' ? plan.plan.targetKcal : null;
  const proteinGoalG = proteinGoalFor(data?.profile ?? null);
  const source =
    data && food.data
      ? {
          foodData: food.data,
          livsmedel: food.livsmedel,
          foodLog: data.foodLog,
          reloadFood: food.reload,
        }
      : null;

  const tabs = (
    <div className="segmented segmented-small page-tabs" role="group" aria-label="Visa">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="segmented-button"
          aria-pressed={t.id === tab}
          onClick={() => {
            setTab(t.id);
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <Page title="Mat" action={tabs}>
      {source && data && tab === 'dag' && (
        <FoodDay
          source={source}
          targetKcal={targetKcal}
          proteinGoalG={proteinGoalG}
          initialPicker={initialPicker}
          onPickerClosed={() => {
            if (sub) window.history.replaceState(null, '', '#/mat');
          }}
          reloadLog={reload}
        />
      )}
      {source && tab === 'egna' && <OwnFoods source={source} onChange={food.reload} />}
      {data && tab === 'historik' && (
        <IntakeHistory foodLog={data.foodLog} targetKcal={targetKcal} proteinGoalG={proteinGoalG} />
      )}
    </Page>
  );
}
