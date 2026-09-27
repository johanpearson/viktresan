import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  findFoodByEan,
  findMealByEan,
  findSupplementByEan,
  putFood,
  saveCustomUnits,
  setFavorite,
  type FoodLogEntry,
  type StoredFood,
} from '../db/db.ts';
import type { FoodLabel } from '../lib/aiLabel.ts';
import { lookupBarcode } from '../lib/barcodeLookup.ts';
import { useFeatures } from '../lib/features.ts';
import {
  buildCatalog,
  favoriteFoods,
  mealToItem,
  recentFoods,
  storedToItem,
} from '../lib/foodCatalog.ts';
import { buildIndex, searchIndex, type FoodItem } from '../lib/foodSearch.ts';
import type { Livsmedel } from '../lib/livsmedel.ts';
import { mealLabel, type MealSlot } from '../lib/nutrition.ts';
import { lastUsage, type FoodUnit } from '../lib/units.ts';
import type { FoodData } from '../lib/useFoodData.ts';
import { AiLabelImport } from './AiLabelImport.tsx';
import { BarcodeElsewhere } from './BarcodeElsewhere.tsx';
import { BarcodeNotFound } from './BarcodeNotFound.tsx';
import { BarcodeScanner } from './BarcodeScanner.tsx';
import { BottomSheet } from './BottomSheet.tsx';
import { CustomFoodForm } from './CustomFoodForm.tsx';
import { FoodList } from './FoodList.tsx';
import { FoodLogForm } from './FoodLogForm.tsx';
import { ScanIcon } from './ScanIcon.tsx';

/** Det sök-sheeten behöver: livsmedel, måltider, favoriter, egna enheter och loggen. */
export interface FoodSource {
  foodData: FoodData;
  livsmedel: Livsmedel | null;
  foodLog: readonly FoodLogEntry[];
  reloadFood: () => Promise<FoodData>;
}

export type PickerMode =
  | {
      kind: 'log';
      date: string;
      /** Förvald måltid (tryck på + i en måltid), annars efter klockslaget. */
      meal: MealSlot | null;
      onLogged: (message: string, meal: MealSlot) => void;
    }
  | {
      kind: 'ingredient';
      onAdd: (
        food: FoodItem,
        value: { amount: number; unit: string; grams: number },
        units: FoodUnit[],
      ) => void;
    };

interface FoodPickerProps {
  source: FoodSource;
  mode: PickerMode;
  /** Öppna direkt i skannerläget (skannerikonen bredvid sökfältet). */
  scan?: boolean;
  /** Fokusera sökfältet när sheeten öppnas. */
  focusSearch?: boolean;
  /** Slå upp streckkoden direkt (länk från Tillskott: "Logga under Mat"). */
  ean?: string | undefined;
  onClose: () => void;
}

type Tab = 'senaste' | 'favoriter' | 'maltider';

type Lookup =
  | { kind: 'idle' }
  | { kind: 'busy'; ean: string }
  | { kind: 'not-found'; ean: string }
  | { kind: 'elsewhere'; ean: string; name: string }
  | { kind: 'ai'; ean: string }
  | { kind: 'error'; message: string };

/** Ett nytt eget livsmedel: streckkod och ev. värden från AI-importen. */
interface Creating {
  ean: string;
  prefill?: FoodLabel;
}

const NO_FOODS: readonly FoodItem[] = [];
const NO_UNITS: readonly FoodUnit[] = [];

/**
 * Helskärms-sheet för att hitta ett livsmedel: sök, flikarna Senaste / Favoriter /
 * Måltider, streckkod och sedan mängd + enhet. Samma komponent loggar mat (Dag)
 * och lägger till ingredienser i en egen måltid (Egna).
 */
export function FoodPicker({
  source,
  mode,
  scan = false,
  focusSearch = false,
  ean: initialEan,
  onClose,
}: FoodPickerProps) {
  const features = useFeatures();
  const { foodData, livsmedel, foodLog, reloadFood } = source;
  const forLog = mode.kind === 'log';
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [scanning, setScanning] = useState(scan);
  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle' });
  const [creating, setCreating] = useState<Creating | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const custom = useMemo(() => foodData.foods.map(storedToItem), [foodData.foods]);
  // En måltid som ingrediens i en måltid vore förvirrande – bara vid loggning.
  const mealItems = useMemo(
    () => (forLog ? foodData.meals.map(mealToItem) : NO_FOODS),
    [forLog, foodData.meals],
  );
  const lvFoods = livsmedel?.foods ?? NO_FOODS;
  const catalog = useMemo(
    () => buildCatalog(lvFoods, custom, mealItems),
    [lvFoods, custom, mealItems],
  );
  const index = useMemo(
    () => buildIndex([...mealItems, ...custom, ...lvFoods]),
    [mealItems, custom, lvFoods],
  );
  const results = useMemo(() => searchIndex(index, deferred, 20), [index, deferred]);
  const recent = useMemo(
    () => recentFoods(foodLog, catalog).filter((f) => forLog || f.source !== 'maltid'),
    [foodLog, catalog, forLog],
  );
  const favorites = useMemo(
    () =>
      favoriteFoods(foodData.favorites, catalog, foodLog).filter(
        (f) => forLog || f.source !== 'maltid',
      ),
    [foodData.favorites, catalog, foodLog, forLog],
  );
  const favoriteIds = new Set(foodData.favorites.map((f) => f.foodId));
  const customUnits = useMemo(
    () => new Map(foodData.foodUnits.map((u) => [u.foodId, u.units])),
    [foodData.foodUnits],
  );
  // Tills användaren valt flik: Senaste om något loggats, annars Favoriter om det finns.
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const tab: Tab =
    chosenTab ?? (recent.length === 0 && favorites.length > 0 ? 'favoriter' : 'senaste');

  useEffect(() => {
    if (focusSearch && !scan && !initialEan) searchRef.current?.focus();
  }, [focusSearch, scan, initialEan]);

  function pick(food: FoodItem) {
    setSelected(food);
    setQuery('');
    setStatus(null);
    setScanning(false);
    setLookup({ kind: 'idle' });
  }

  async function handleEan(ean: string) {
    setScanning(false);
    setLookup({ kind: 'busy', ean });
    const result = await lookupBarcode(ean, {
      context: 'mat',
      local: { food: findFoodByEan, meal: findMealByEan, supplement: findSupplementByEan },
      supplementsEnabled: features.isEnabled('tillskott'),
      foodEnabled: true,
    });
    switch (result.kind) {
      case 'food':
        pick(storedToItem(result.food));
        return;
      case 'meal':
        if (forLog) pick(mealToItem(result.meal));
        else {
          setLookup({
            kind: 'error',
            message: `Streckkoden hör till måltiden ${result.meal.name} – en måltid kan inte vara en ingrediens.`,
          });
        }
        return;
      case 'off-food': {
        // Cacha träffen lokalt så att nästa skanning fungerar offline.
        const { food } = result;
        const stored: StoredFood = {
          id: food.id,
          name: food.name,
          source: 'openfoodfacts',
          per100: food.per100,
          ean,
          createdAt: Date.now(),
        };
        if (food.units) stored.units = food.units;
        if (food.per100Unit === 'ml') stored.per100Unit = 'ml';
        await putFood(stored);
        await reloadFood();
        pick(food);
        return;
      }
      case 'elsewhere':
        setLookup({ kind: 'elsewhere', ean, name: result.name });
        return;
      case 'not-found':
        setLookup({ kind: 'not-found', ean });
        return;
      case 'error':
        setLookup({ kind: 'error', message: result.message });
        return;
      case 'supplement':
      case 'off-supplement':
        // Ges bara i Tillskott.
        setLookup({ kind: 'not-found', ean });
    }
  }

  // En streckkod i adressen (från Tillskott) slås upp direkt.
  const lookedUp = useRef(false);
  useEffect(() => {
    if (!initialEan || lookedUp.current) return;
    lookedUp.current = true;
    void handleEan(initialEan);
  });

  async function toggleFavorite(food: FoodItem) {
    await setFavorite(food.id, !favoriteIds.has(food.id));
    await reloadFood();
  }

  const title =
    mode.kind === 'ingredient'
      ? 'Lägg till ingrediens'
      : mode.meal
        ? `Lägg till i ${mealLabel(mode.meal).toLowerCase()}`
        : 'Logga mat';

  let body;
  if (creating !== null) {
    body = (
      <CustomFoodForm
        food={null}
        ean={creating.ean}
        prefill={creating.prefill}
        onSaved={(food) => {
          setCreating(null);
          void reloadFood().then(() => {
            pick(storedToItem(food));
          });
        }}
        onCancel={() => {
          setCreating(null);
        }}
      />
    );
  } else if (lookup.kind === 'ai') {
    const { ean } = lookup;
    body = (
      <AiLabelImport
        kind="livsmedel"
        ean={ean}
        onUse={(prefill) => {
          setCreating({ ean, prefill });
          setLookup({ kind: 'idle' });
        }}
        onCancel={() => {
          setLookup({ kind: 'not-found', ean });
        }}
      />
    );
  } else if (selected) {
    body = (
      <FoodLogForm
        key={selected.id}
        food={selected}
        purpose={mode.kind}
        customUnits={customUnits.get(selected.id) ?? NO_UNITS}
        last={lastUsage(foodLog, selected.id)}
        editing={null}
        date={mode.kind === 'log' ? mode.date : ''}
        defaultMeal={mode.kind === 'log' ? mode.meal : null}
        favorite={favoriteIds.has(selected.id)}
        onToggleFavorite={() => void toggleFavorite(selected)}
        onUnitsChange={async (units) => {
          await saveCustomUnits(selected.id, units);
          await reloadFood();
        }}
        onSaved={(message, meal) => {
          setSelected(null);
          setStatus(message);
          if (mode.kind === 'log') mode.onLogged(message, meal);
        }}
        onAdd={(value, units) => {
          if (mode.kind === 'ingredient') mode.onAdd(selected, value, units);
        }}
        onCancel={() => {
          setSelected(null);
        }}
      />
    );
  } else {
    const tabs: readonly { id: Tab; label: string }[] = forLog
      ? [
          { id: 'senaste', label: 'Senaste' },
          { id: 'favoriter', label: 'Favoriter' },
          { id: 'maltider', label: 'Måltider' },
        ]
      : [
          { id: 'senaste', label: 'Senaste' },
          { id: 'favoriter', label: 'Favoriter' },
        ];
    body = (
      <>
        <div className="search-bar">
          <label className="search-field">
            <span className="visually-hidden">Sök livsmedel</span>
            <span aria-hidden="true" className="search-icon" />
            <input
              ref={searchRef}
              className="input"
              type="search"
              placeholder="Sök livsmedel"
              autoComplete="off"
              enterKeyHint="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="icon-button scan-button"
            aria-label="Skanna streckkod"
            aria-haspopup="dialog"
            onClick={() => {
              setScanning(true);
              setLookup({ kind: 'idle' });
            }}
          >
            <ScanIcon />
          </button>
        </div>
        <p className="form-ok status-line" role="status">
          {status}
        </p>
        {lookup.kind === 'busy' && (
          <p className="card" role="status">
            Slår upp {lookup.ean} …
          </p>
        )}
        {lookup.kind === 'error' && (
          <p className="card form-error" role="alert">
            {lookup.message}
          </p>
        )}
        {lookup.kind === 'not-found' && (
          <BarcodeNotFound
            ean={lookup.ean}
            kind="livsmedel"
            onAi={() => {
              setLookup({ kind: 'ai', ean: lookup.ean });
            }}
            onManual={() => {
              setCreating({ ean: lookup.ean });
              setLookup({ kind: 'idle' });
            }}
          />
        )}
        {lookup.kind === 'elsewhere' && (
          <BarcodeElsewhere
            ean={lookup.ean}
            target="tillskott"
            name={lookup.name}
            href={`#/logga/tillskott/ean/${lookup.ean}`}
          />
        )}
        {deferred.trim() !== '' ? (
          <FoodList
            items={results}
            onPick={pick}
            empty={livsmedel === null ? 'Laddar livsmedelsdatabasen …' : 'Inga träffar.'}
            testId="search-result"
            markProteinRich
          />
        ) : (
          lookup.kind === 'idle' && (
            <>
              <div className="segmented segmented-small" role="group" aria-label="Snabbval">
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
                  <FoodList
                    items={recent}
                    onPick={pick}
                    empty="Inget loggat ännu. Sök efter ett livsmedel ovan."
                    testId="quick-pick"
                  />
                )}
                {tab === 'favoriter' && (
                  <FoodList
                    items={favorites}
                    onPick={pick}
                    empty="Inga favoriter ännu. Tryck på stjärnan när du loggar."
                    testId="quick-pick"
                    markProteinRich
                  />
                )}
                {tab === 'maltider' && forLog && (
                  <FoodList
                    items={mealItems}
                    onPick={pick}
                    empty="Inga sparade måltider. Skapa en under Egna."
                    testId="quick-pick"
                  />
                )}
              </div>
            </>
          )
        )}
      </>
    );
  }

  return (
    <>
      <BottomSheet title={title} full onClose={onClose}>
        <div className="food-picker">{body}</div>
      </BottomSheet>
      {/* Efter panelen: dess showModal körs först, så att skannern hamnar överst. */}
      {scanning && (
        <BarcodeScanner
          onEan={(ean) => void handleEan(ean)}
          onClose={() => {
            setScanning(false);
          }}
        />
      )}
    </>
  );
}
