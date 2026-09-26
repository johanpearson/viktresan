import { useMemo, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet.tsx';
import { FoodDay } from '../components/FoodDay.tsx';
import { IntakeHistory } from '../components/IntakeHistory.tsx';
import { OwnFoods } from '../components/OwnFoods.tsx';
import { Page } from '../components/Page.tsx';
import { todayIso } from '../lib/dates.ts';
import { mealToItem, storedToItem } from '../lib/foodCatalog.ts';
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
  // "#/mat/logga" (genvägen "Logga mat") öppnar panelen direkt.
  const { sub } = useHashRoute();
  const [sheetOpen, setSheetOpen] = useState(() => sub === 'logga');
  const searchItems = useMemo(
    () => [
      ...(food.data?.meals.map(mealToItem) ?? []),
      ...(food.data?.foods.map(storedToItem) ?? []),
      ...(food.livsmedel?.foods ?? []),
    ],
    [food.data, food.livsmedel],
  );

  const plan =
    data?.profile != null ? buildPlan(data.profile, data.weights, data.foodLog, todayIso()) : null;
  const targetKcal = plan?.kind === 'plan' ? plan.plan.targetKcal : null;
  const proteinGoalG = proteinGoalFor(data?.profile ?? null);

  return (
    <Page title="Mat">
      <div className="segmented" role="group" aria-label="Visa">
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
      {data && food.data && tab === 'dag' && (
        <FoodDay
          foodLog={data.foodLog}
          foodData={food.data}
          livsmedel={food.livsmedel}
          targetKcal={targetKcal}
          proteinGoalG={proteinGoalG}
          reloadLog={reload}
          reloadFood={food.reload}
        />
      )}
      {food.data && tab === 'egna' && (
        <OwnFoods
          foods={food.data.foods}
          meals={food.data.meals}
          foodUnits={food.data.foodUnits}
          searchItems={searchItems}
          loading={food.livsmedel === null}
          onChange={food.reload}
        />
      )}
      {data && tab === 'historik' && (
        <IntakeHistory foodLog={data.foodLog} targetKcal={targetKcal} proteinGoalG={proteinGoalG} />
      )}
      {data && food.data && sheetOpen && (
        <BottomSheet
          title="Logga mat"
          onClose={() => {
            setSheetOpen(false);
            if (sub) window.history.replaceState(null, '', '#/mat');
          }}
        >
          <FoodDay
            variant="sheet"
            foodLog={data.foodLog}
            foodData={food.data}
            livsmedel={food.livsmedel}
            targetKcal={targetKcal}
            proteinGoalG={proteinGoalG}
            reloadLog={reload}
            reloadFood={food.reload}
          />
        </BottomSheet>
      )}
    </Page>
  );
}
