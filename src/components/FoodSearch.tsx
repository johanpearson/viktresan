import { useDeferredValue, useMemo, useState } from 'react';
import { buildIndex, searchIndex, type FoodItem } from '../lib/foodSearch.ts';
import { FoodList } from './FoodList.tsx';

interface FoodSearchProps {
  items: readonly FoodItem[];
  onPick: (item: FoodItem) => void;
  label?: string;
  /** Livsmedelsverkets data laddas fortfarande. */
  loading?: boolean;
  /** Visa etiketten "Proteinrik" på träffarna. */
  markProteinRich?: boolean;
}

/** Sökfält med fuzzy-sökning bland livsmedel. */
export function FoodSearch({
  items,
  onPick,
  label = 'Sök livsmedel',
  loading,
  markProteinRich = false,
}: FoodSearchProps) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const index = useMemo(() => buildIndex(items), [items]);
  const results = useMemo(() => searchIndex(index, deferred, 20), [index, deferred]);

  return (
    <div className="food-search">
      <label className="field">
        <span className="field-label">{label}</span>
        <input
          className="input"
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
      </label>
      {deferred.trim() !== '' && (
        <FoodList
          items={results}
          onPick={(item) => {
            setQuery('');
            onPick(item);
          }}
          empty={loading ? 'Laddar livsmedelsdatabasen …' : 'Inga träffar.'}
          testId="search-result"
          markProteinRich={markProteinRich}
        />
      )}
    </div>
  );
}
