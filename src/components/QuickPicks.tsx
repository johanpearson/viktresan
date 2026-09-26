import { useState } from 'react';
import type { FoodItem } from '../lib/foodSearch.ts';
import { FoodList } from './FoodList.tsx';

type Tab = 'senaste' | 'favoriter' | 'maltider';

interface QuickPicksProps {
  recent: readonly FoodItem[];
  favorites: readonly FoodItem[];
  meals: readonly FoodItem[];
  onPick: (item: FoodItem) => void;
}

/** Snabbval: senaste, favoriter och sparade måltider. */
export function QuickPicks({ recent, favorites, meals, onPick }: QuickPicksProps) {
  const [tab, setTab] = useState<Tab>(() => (recent.length > 0 ? 'senaste' : 'favoriter'));
  const tabs: readonly { id: Tab; label: string }[] = [
    { id: 'senaste', label: 'Senaste' },
    { id: 'favoriter', label: 'Favoriter' },
    { id: 'maltider', label: 'Måltider' },
  ];
  return (
    <section className="card" aria-labelledby="quick-title">
      <h2 className="card-title" id="quick-title">
        Snabbval
      </h2>
      <div className="segmented" role="group" aria-label="Snabbval">
        {tabs.map((t) => (
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
      <div className="quick-list">
        {tab === 'senaste' && (
          <FoodList items={recent} onPick={onPick} empty="Inget loggat ännu." testId="quick-pick" />
        )}
        {tab === 'favoriter' && (
          <FoodList
            items={favorites}
            onPick={onPick}
            empty="Inga favoriter ännu. Tryck på stjärnan när du loggar."
            testId="quick-pick"
            markProteinRich
          />
        )}
        {tab === 'maltider' && (
          <FoodList
            items={meals}
            onPick={onPick}
            empty="Inga sparade måltider. Skapa en under Egna."
            testId="quick-pick"
          />
        )}
      </div>
    </section>
  );
}
