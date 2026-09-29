import { useState } from 'react';
import { FoodDay } from '../components/FoodDay.tsx';
import { IntakeHistory } from '../components/IntakeHistory.tsx';
import { NutritionView } from '../components/NutritionView.tsx';
import { OwnFoods } from '../components/OwnFoods.tsx';
import { Page } from '../components/Page.tsx';
import { SegmentedControl } from '../components/SegmentedControl.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { aiContextFrom } from '../lib/aiPrompt.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { buildPlan } from '../lib/plan.ts';
import { proteinGoalFor } from '../lib/protein.ts';
import { useAppData } from '../lib/useAppData.ts';
import { useFiber } from '../lib/useFiber.ts';
import { useFoodData } from '../lib/useFoodData.ts';
import { useHashRoute } from '../lib/useHashRoute.ts';

const NO_LOG: readonly never[] = [];

type Tab = 'dag' | 'egna' | 'historik' | 'naring';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'dag', label: 'Dag' },
  { id: 'egna', label: 'Egna' },
  { id: 'historik', label: 'Historik' },
  { id: 'naring', label: 'Näring' },
];

export function Mat() {
  const { data, reload } = useAppData();
  const food = useFoodData();
  const features = useFeatures();
  // "#/mat/logga" (genvägen "Logga mat") öppnar sök-sheeten direkt, "#/mat/ean/<kod>" slår
  // upp en streckkod (från Tillskott) och "#/mat/naring" öppnar Näring.
  const { sub } = useHashRoute();
  const [tab, setTab] = useState<Tab>(() => (sub === 'naring' ? 'naring' : 'dag'));
  const [initialPicker] = useState(() => sub === 'logga');
  const [initialEan] = useState(() => /^ean\/(\d{8,14})$/.exec(sub)?.[1]);

  const plan =
    data?.profile != null ? buildPlan(data.profile, data.weights, data.foodLog, todayIso()) : null;
  const targetKcal = plan?.kind === 'plan' ? plan.plan.targetKcal : null;
  const weekly =
    plan?.kind === 'plan' && data?.profile?.calorieMode === 'vecka'
      ? { floorKcal: plan.plan.floorKcal }
      : null;
  const proteinGoalG = proteinGoalFor(data?.profile ?? null);
  const fiber = useFiber(data?.profile ?? null, data?.foodLog ?? NO_LOG, todayIso());
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
    <SegmentedControl
      label="Visa"
      size="small"
      className="page-tabs"
      options={TABS}
      value={tab}
      onChange={setTab}
    />
  );

  return (
    <Page title="Mat" action={tabs}>
      {!source && <Skeleton cards={2} lines={2} />}
      {source && data && tab === 'dag' && (
        <FoodDay
          source={source}
          targetKcal={targetKcal}
          weekly={weekly}
          proteinGoalG={proteinGoalG}
          fiberGoalOn={fiber.goalOn}
          initialPicker={initialPicker}
          initialEan={initialEan}
          onPickerClosed={() => {
            if (sub) window.history.replaceState(null, '', '#/mat');
          }}
          reloadLog={reload}
          aiContext={aiContextFrom(data, todayIso())}
        />
      )}
      {source && tab === 'egna' && <OwnFoods source={source} onChange={food.reload} />}
      {data && tab === 'historik' && (
        <IntakeHistory
          foodLog={data.foodLog}
          targetKcal={targetKcal}
          proteinGoalG={proteinGoalG}
          fiberDays={fiber.goal ? fiber.days : null}
          fiberGoalOn={fiber.goalOn}
        />
      )}
      {source && data && tab === 'naring' && (
        <NutritionView
          foodLog={data.foodLog}
          meals={source.foodData.meals}
          livsmedel={food.livsmedel?.foods ?? null}
          supplementLog={data.supplementLog}
          supplements={features.isEnabled('tillskott')}
        />
      )}
    </Page>
  );
}
