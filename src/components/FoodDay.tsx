import { useMemo, useRef, useState } from 'react';
import {
  findFoodByEan,
  putFood,
  saveCustomUnits,
  setFavorite,
  type FoodLogEntry,
  type StoredFood,
} from '../db/db.ts';
import { lookupOpenFoodFacts } from '../lib/barcode.ts';
import { todayIso } from '../lib/dates.ts';
import {
  buildCatalog,
  entryToItem,
  favoriteFoods,
  mealToItem,
  recentFoods,
  storedToItem,
} from '../lib/foodCatalog.ts';
import type { FoodItem } from '../lib/foodSearch.ts';
import { formatDate } from '../lib/format.ts';
import type { Livsmedel } from '../lib/livsmedel.ts';
import { totalOf } from '../lib/nutrition.ts';
import { lastUsage, type FoodUnit } from '../lib/units.ts';
import type { FoodData } from '../lib/useFoodData.ts';
import { BarcodeScanner } from './BarcodeScanner.tsx';
import { CustomFoodForm } from './CustomFoodForm.tsx';
import { DaySummary } from './DaySummary.tsx';
import { FoodDayLog } from './FoodDayLog.tsx';
import { FoodLogForm } from './FoodLogForm.tsx';
import { FoodSearch } from './FoodSearch.tsx';
import { QuickPicks } from './QuickPicks.tsx';

interface FoodDayProps {
  foodLog: readonly FoodLogEntry[];
  foodData: FoodData;
  livsmedel: Livsmedel | null;
  targetKcal: number | null;
  reloadLog: () => Promise<unknown>;
  reloadFood: () => Promise<FoodData>;
}

interface Selection {
  food: FoodItem;
  editing: FoodLogEntry | null;
}

type Lookup =
  | { kind: 'idle' }
  | { kind: 'busy'; ean: string }
  | { kind: 'not-found'; ean: string }
  | { kind: 'error'; message: string };

const NO_FOODS: readonly FoodItem[] = [];
const NO_UNITS: readonly FoodUnit[] = [];

/**
 * För redigering: livsmedlet ur katalogen (med dess enheter) men med namn och
 * värden som de loggades. Enheten posten loggades med läggs på i `FoodLogForm`.
 */
function itemForEntry(entry: FoodLogEntry, catalog: ReadonlyMap<string, FoodItem>): FoodItem {
  const item = entryToItem(entry);
  const known = catalog.get(entry.foodId);
  if (known?.units) item.units = known.units;
  else delete item.units;
  return item;
}

/** Mat → Dag: summering, snabbval, sök, skanna och dagens logg. */
export function FoodDay({
  foodLog,
  foodData,
  livsmedel,
  targetKcal,
  reloadLog,
  reloadFood,
}: FoodDayProps) {
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle' });
  const [creatingEan, setCreatingEan] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const custom = useMemo(() => foodData.foods.map(storedToItem), [foodData.foods]);
  const mealItems = useMemo(() => foodData.meals.map(mealToItem), [foodData.meals]);
  const lvFoods = livsmedel?.foods ?? NO_FOODS;
  const catalog = useMemo(
    () => buildCatalog(lvFoods, custom, mealItems),
    [lvFoods, custom, mealItems],
  );
  const searchItems = useMemo(
    () => [...mealItems, ...custom, ...lvFoods],
    [mealItems, custom, lvFoods],
  );
  const recent = useMemo(() => recentFoods(foodLog, catalog), [foodLog, catalog]);
  const favorites = useMemo(
    () => favoriteFoods(foodData.favorites, catalog, foodLog),
    [foodData.favorites, catalog, foodLog],
  );
  const favoriteIds = new Set(foodData.favorites.map((f) => f.foodId));
  const customUnits = useMemo(
    () => new Map(foodData.foodUnits.map((u) => [u.foodId, u.units])),
    [foodData.foodUnits],
  );

  const entries = foodLog.filter((e) => e.date === date);
  const totals = totalOf(entries);

  function select(next: Selection) {
    setSelection(next);
    setStatus(null);
    setScanning(false);
    setLookup({ kind: 'idle' });
    topRef.current?.scrollIntoView({ block: 'start' });
  }

  async function handleEan(ean: string) {
    setLookup({ kind: 'busy', ean });
    const local = await findFoodByEan(ean);
    if (local) {
      select({ food: storedToItem(local), editing: null });
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
      await putFood(stored);
      await reloadFood();
      select({ food, editing: null });
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

  let main;
  if (creatingEan !== null) {
    main = (
      <CustomFoodForm
        food={null}
        ean={creatingEan}
        onSaved={(food) => {
          setCreatingEan(null);
          void reloadFood().then(() => {
            select({ food: storedToItem(food), editing: null });
          });
        }}
        onCancel={() => {
          setCreatingEan(null);
        }}
      />
    );
  } else if (selection) {
    main = (
      <FoodLogForm
        key={`${selection.food.id}:${selection.editing?.id ?? 'ny'}`}
        food={selection.food}
        customUnits={customUnits.get(selection.food.id) ?? NO_UNITS}
        last={lastUsage(foodLog, selection.food.id)}
        editing={selection.editing}
        date={date}
        favorite={favoriteIds.has(selection.food.id)}
        onToggleFavorite={() => void toggleFavorite(selection.food)}
        onUnitsChange={async (units) => {
          await saveCustomUnits(selection.food.id, units);
          await reloadFood();
        }}
        onSaved={(message) => {
          setSelection(null);
          void reloadLog().then(() => {
            setStatus(message);
          });
        }}
        onCancel={() => {
          setSelection(null);
        }}
      />
    );
  } else {
    main = (
      <>
        <QuickPicks
          recent={recent}
          favorites={favorites}
          meals={mealItems}
          onPick={(food) => {
            select({ food, editing: null });
          }}
        />
        <section className="card form" aria-labelledby="search-title">
          <h2 className="card-title" id="search-title">
            Sök och skanna
          </h2>
          <FoodSearch
            items={searchItems}
            loading={livsmedel === null}
            onPick={(food) => {
              select({ food, editing: null });
            }}
          />
          {!scanning && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setScanning(true);
              }}
            >
              Skanna streckkod
            </button>
          )}
          <p className="form-note muted" data-testid="livsmedel-source">
            {livsmedel === null
              ? 'Laddar livsmedelsdatabasen …'
              : livsmedel.foods.length > 0
                ? `Näringsvärden: ${livsmedel.source} (${livsmedel.license}${livsmedel.retrieved ? `, hämtad ${formatDate(livsmedel.retrieved)}` : ''}).`
                : 'Livsmedelsverkets databas ingår inte i den här versionen. Egna livsmedel, måltider och streckkoder fungerar.'}
          </p>
        </section>
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
      </>
    );
  }

  return (
    <>
      <div ref={topRef} className="card day-picker">
        <label className="field">
          <span className="field-label">Dag</span>
          <input
            className="input"
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </label>
      </div>
      <DaySummary date={date} today={today} totals={totals} targetKcal={targetKcal} />
      <p className="form-ok status-line" role="status">
        {status}
      </p>
      {main}
      <FoodDayLog
        entries={entries}
        onEdit={(entry) => {
          select({ food: itemForEntry(entry, catalog), editing: entry });
        }}
        onDeleted={() => {
          void reloadLog().then(() => {
            setStatus('Posten är borttagen.');
          });
        }}
      />
    </>
  );
}
