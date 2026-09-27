import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  findFoodByEan,
  putFood,
  saveCustomUnits,
  setFavorite,
  type FoodLogEntry,
  type StoredFood,
} from '../db/db.ts';
import { lookupOpenFoodFacts } from '../lib/barcode.ts';
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
  onClose: () => void;
}

type Tab = 'senaste' | 'favoriter' | 'maltider';

type Lookup =
  | { kind: 'idle' }
  | { kind: 'busy'; ean: string }
  | { kind: 'not-found'; ean: string }
  | { kind: 'error'; message: string };

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
  onClose,
}: FoodPickerProps) {
  const { foodData, livsmedel, foodLog, reloadFood } = source;
  const forLog = mode.kind === 'log';
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [scanning, setScanning] = useState(scan);
  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle' });
  const [creatingEan, setCreatingEan] = useState<string | null>(null);
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
    if (focusSearch && !scan) searchRef.current?.focus();
  }, [focusSearch, scan]);

  function pick(food: FoodItem) {
    setSelected(food);
    setQuery('');
    setStatus(null);
    setScanning(false);
    setLookup({ kind: 'idle' });
  }

  async function handleEan(ean: string) {
    setLookup({ kind: 'busy', ean });
    const local = await findFoodByEan(ean);
    if (local) {
      pick(storedToItem(local));
      return;
    }
    const result = await lookupOpenFoodFacts(ean);
    if (result.kind === 'found') {
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
    } else if (result.kind === 'not-found') {
      setLookup({ kind: 'not-found', ean });
    } else {
      setLookup({ kind: 'error', message: result.message });
    }
  }

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
  if (creatingEan !== null) {
    body = (
      <CustomFoodForm
        food={null}
        ean={creatingEan}
        onSaved={(food) => {
          setCreatingEan(null);
          void reloadFood().then(() => {
            pick(storedToItem(food));
          });
        }}
        onCancel={() => {
          setCreatingEan(null);
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
            aria-pressed={scanning}
            onClick={() => {
              setScanning((s) => !s);
              setLookup({ kind: 'idle' });
            }}
          >
            <ScanIcon />
          </button>
        </div>
        <p className="form-ok status-line" role="status">
          {status}
        </p>
        {scanning && (
          <BarcodeScanner
            busy={lookup.kind === 'busy'}
            onEan={(ean) => void handleEan(ean)}
            onClose={() => {
              setScanning(false);
              setLookup({ kind: 'idle' });
            }}
          />
        )}
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
          <div className="card form" data-testid="ean-not-found">
            <p className="form-note">
              Streckkoden {lookup.ean} finns inte i Open Food Facts. Du kan lägga till produkten
              själv med värdena från förpackningen.
            </p>
            <button
              type="button"
              className="button"
              onClick={() => {
                setCreatingEan(lookup.ean);
                setLookup({ kind: 'idle' });
              }}
            >
              Skapa eget livsmedel
            </button>
          </div>
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
          !scanning && (
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
    <BottomSheet title={title} full onClose={onClose}>
      <div className="food-picker">{body}</div>
    </BottomSheet>
  );
}
