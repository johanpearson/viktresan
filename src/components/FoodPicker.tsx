import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  deleteFood,
  deleteHiddenFoods,
  deleteMeal,
  deleteRecipe,
  findFoodByEan,
  findMealByEan,
  findSupplementByEan,
  putFood,
  putHiddenFoods,
  saveCustomUnits,
  setFavorite,
  type FoodLogEntry,
  type StoredFood,
} from '../db/db.ts';
import { CLAIM_RULES, type ClaimId } from '../data/nutritionClaims.ts';
import type { FoodLabel } from '../lib/aiLabel.ts';
import { claimsFor } from '../lib/claims.ts';
import { lookupBarcode } from '../lib/barcodeLookup.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import {
  buildCatalog,
  fiberSourceFor,
  favoriteFoods,
  mealToItem,
  recentFoods,
  storedItems,
  storedToItem,
} from '../lib/foodCatalog.ts';
import { filtersFrom, hiddenFoodEntry, visibleFoods } from '../lib/foodFilters.ts';
import { applyOverride, overrideMap } from '../lib/foodNutrition.ts';
import { collapseVariants, isOwn, searchPriority, usageScores } from '../lib/foodRanking.ts';
import { buildIndex, searchIndex, type FoodItem } from '../lib/foodSearch.ts';
import type { Livsmedel } from '../lib/livsmedel.ts';
import { mealName, type MealId } from '../lib/mealSlots.ts';
import { usePreferences } from '../lib/preferences.ts';
import { quickValuesOf, type QuickValues } from '../lib/quickLog.ts';
import { recipeToItem } from '../lib/recipes.ts';
import { lastUsage, type FoodUnit, type Usage } from '../lib/units.ts';
import type { FoodData } from '../lib/useFoodData.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { ActionSheet } from './ActionSheet.tsx';
import { AiLabelImport } from './AiLabelImport.tsx';
import { BarcodeElsewhere } from './BarcodeElsewhere.tsx';
import { BarcodeNotFound } from './BarcodeNotFound.tsx';
import { BarcodeScanner } from './BarcodeScanner.tsx';
import { BottomSheet } from './BottomSheet.tsx';
import { CustomFoodForm } from './CustomFoodForm.tsx';
import { FoodList } from './FoodList.tsx';
import { FoodLogForm } from './FoodLogForm.tsx';
import { ListRow } from './ListRow.tsx';
import { QuickLogForm } from './QuickLogForm.tsx';
import { ScanIcon } from './ScanIcon.tsx';
import { Toast } from './Toast.tsx';

/** Det sök-sheeten behöver: livsmedel, måltider, recept, favoriter, egna enheter och loggen. */
export interface FoodSource {
  foodData: FoodData;
  livsmedel: Livsmedel | null;
  foodLog: readonly FoodLogEntry[];
  reloadFood: () => Promise<FoodData>;
  /** Läser om matloggen (efter att tidigare poster fått kompletterade värden). */
  reloadLog?: () => Promise<unknown>;
}

export type PickerMode =
  | {
      kind: 'log';
      date: string;
      /** Förvald måltid (tryck på + i en måltid), annars efter klockslaget. */
      meal: MealId | null;
      onLogged: (message: string, meal: MealId) => void;
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
  /** Förifylld sökning (receptimporten: ingrediensens namn). */
  initialQuery?: string;
  /** Förvald mängd och enhet i stället för den senast loggade (receptimporten). */
  initialUsage?: Usage | null;
  /** Egen rubrik (annars "Logga mat" / "Lägg till ingrediens"). */
  title?: string;
  /** Etiketter vars filterchip visas först (stort protein-/fibergap idag) – inte förvalda. */
  firstClaims?: readonly ClaimId[];
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
const NO_CLAIMS: readonly ClaimId[] = [];
const NO_KEYS: ReadonlySet<string> = new Set();

/** Sorteringsnyckel: etiketter i `first` i den ordningen, övriga efter. */
function claimOrder(first: readonly ClaimId[], id: ClaimId): number {
  const index = first.indexOf(id);
  return index === -1 ? first.length : index;
}
/**
 * Sökträffar: 20 visas. Sökningen tar fler så att varianter kan fällas ihop (högst tre per
 * variant), och fler till när de filtreras på etiketter.
 */
const SEARCH_LIMIT = 20;
const VARIANT_SEARCH_LIMIT = 60;
const FILTERED_SEARCH_LIMIT = 400;

/** Måltider, recept och snabbloggar kan inte vara ingredienser. */
function isIngredient(food: FoodItem): boolean {
  return food.source !== 'maltid' && food.source !== 'recept' && food.source !== 'snabb';
}

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
  initialQuery = '',
  initialUsage = null,
  title: customTitle,
  firstClaims = NO_CLAIMS,
  onClose,
}: FoodPickerProps) {
  const features = useFeatures();
  const { prefs } = usePreferences();
  const { foodData, livsmedel, foodLog, reloadFood, reloadLog } = source;
  const forLog = mode.kind === 'log';
  const [query, setQuery] = useState(initialQuery);
  const deferred = useDeferredValue(query);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [scanning, setScanning] = useState(scan);
  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle' });
  const [creating, setCreating] = useState<Creating | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  /** Snabbloggens formulär: tomt eller förifyllt från ett snabbval. */
  const [quick, setQuick] = useState<{ initial: QuickValues | null } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Långtryck på en rad: meny med Dölj (eller bekräftelsen Ta bort för egna). */
  const [menu, setMenu] = useState<FoodItem | null>(null);
  /** Ta bort ett eget livsmedel, en måltid eller ett recept – kräver bekräftelse. */
  const [confirmRemove, setConfirmRemove] = useState<FoodItem | null>(null);
  /** Nytt värde ritar om raderna, så att en bortsvept rad kommer tillbaka (avbruten Ta bort). */
  const [rowsVersion, setRowsVersion] = useState(0);
  /** Varianter som fällts ut med "Visa fler varianter" (nollställs vid ny sökning). */
  const [expanded, setExpanded] = useState<{ query: string; keys: ReadonlySet<string> }>({
    query: '',
    keys: new Set(),
  });
  const toast = useUndoToast();
  /** Filterchips: bara livsmedel med alla valda etiketter. */
  const [filters, setFilters] = useState<ReadonlySet<ClaimId>>(() => new Set());
  // Chips för stora gap först (i gapens ordning), sedan resten i vanlig ordning.
  const claimFilters = CLAIM_RULES.filter((c) => !prefs.claimsHidden.includes(c.id)).sort(
    (a, b) => claimOrder(firstClaims, a.id) - claimOrder(firstClaims, b.id),
  );
  const activeFilters = claimFilters.filter((c) => filters.has(c.id)).map((c) => c.id);
  const overrides = useMemo(() => overrideMap(foodData.overrides), [foodData.overrides]);

  const custom = useMemo(() => storedItems(foodData), [foodData]);
  // En måltid som ingrediens i en måltid vore förvirrande – bara vid loggning.
  const mealItems = useMemo(
    () => (forLog ? foodData.meals.map(mealToItem) : NO_FOODS),
    [forLog, foodData.meals],
  );
  const recipeItems = useMemo(
    () => (forLog ? foodData.recipes.map(recipeToItem) : NO_FOODS),
    [forLog, foodData.recipes],
  );
  const lvFoods = livsmedel?.foods ?? NO_FOODS;
  const catalog = useMemo(
    () => buildCatalog(lvFoods, custom, mealItems, recipeItems),
    [lvFoods, custom, mealItems, recipeItems],
  );
  // Fiber ur katalogen (Livsmedelsverket, egna, OFF) – först när Livsmedelsverkets data finns.
  const fiberSource = useMemo(
    () => (livsmedel ? fiberSourceFor(catalog, foodData) : null),
    [livsmedel, catalog, foodData],
  );
  // Dolda livsmedel, kategorier och källor (Inställningar → Matsökning) är inte med i sökningen.
  const hidden = useMemo(() => filtersFrom(foodData.hidden), [foodData.hidden]);
  const index = useMemo(
    () => buildIndex(visibleFoods([...recipeItems, ...mealItems, ...custom, ...lvFoods], hidden)),
    [recipeItems, mealItems, custom, lvFoods, hidden],
  );
  // Egna och nyligen loggade först (frekvens och hur nyligen).
  const priority = useMemo(() => searchPriority(usageScores(foodLog, todayIso())), [foodLog]);
  const filtering = activeFilters.length > 0;
  const hits = useMemo(
    () =>
      searchIndex(
        index,
        deferred,
        filtering ? FILTERED_SEARCH_LIMIT : VARIANT_SEARCH_LIMIT,
        priority,
      ),
    [index, deferred, filtering, priority],
  );
  const byFilter = (items: readonly FoodItem[]): readonly FoodItem[] =>
    activeFilters.length === 0
      ? items
      : items.filter((item) => {
          const claims = claimsFor(item, fiberSource);
          return activeFilters.every((id) => claims.includes(id));
        });
  // Högst tre träffar per variant ("Bröd fullkorn …") innan "Visa fler varianter"; egna och
  // loggade fälls aldrig ihop.
  const expandedKeys = expanded.query === deferred ? expanded.keys : NO_KEYS;
  const rows = collapseVariants(filtering ? byFilter(hits) : hits, {
    expanded: expandedKeys,
    protect: (item) => priority(item) !== null,
    limit: SEARCH_LIMIT,
  });
  const results = rows.flatMap((r) => (r.kind === 'item' ? [r.item] : []));
  const moreRows = new Map<string, ReactNode>();
  for (const [i, row] of rows.entries()) {
    const prev = rows[i - 1];
    if (row.kind !== 'more' || prev?.kind !== 'item') continue;
    moreRows.set(
      prev.item.id,
      <li key={`more-${row.key}`}>
        <button
          type="button"
          className="pick-more"
          data-testid="more-variants"
          onClick={() => {
            setExpanded({ query: deferred, keys: new Set([...expandedKeys, row.key]) });
          }}
        >
          Visa fler varianter av {row.label} ({row.hidden})
        </button>
      </li>,
    );
  }
  const recent = useMemo(
    () =>
      recentFoods(foodLog, catalog, 8 + hidden.ids.size).filter(
        (f) => !hidden.ids.has(f.id) && (forLog || isIngredient(f)),
      ),
    [foodLog, catalog, forLog, hidden],
  );
  const favorites = useMemo(
    () =>
      favoriteFoods(foodData.favorites, catalog, foodLog).filter(
        (f) => !hidden.ids.has(f.id) && (forLog || isIngredient(f)),
      ),
    [foodData.favorites, catalog, foodLog, forLog, hidden],
  );
  const ownDishes = useMemo(() => [...mealItems, ...recipeItems], [mealItems, recipeItems]);
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
    if (food.source === 'snabb') {
      // Ett snabbval (Senaste/Favoriter) öppnar snabbloggen förifylld.
      setQuick({ initial: quickValuesOf(food) });
      setQuery('');
      setStatus(null);
      return;
    }
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
        // Egna näringsvärden går före (samma uppslagsordning: lokalt först).
        pick(applyOverride(storedToItem(result.food), overrides.get(result.food.id)));
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
        if (food.extra?.fiberG !== undefined) stored.fiberG = food.extra.fiberG;
        if (food.extra?.sugarG !== undefined) stored.sugarG = food.extra.sugarG;
        if (food.missing) stored.missing = food.missing;
        await putFood(stored);
        await reloadFood();
        pick(applyOverride(food, overrides.get(food.id)));
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

  /** Döljer livsmedlet i sökning och snabbval, med Ångra. Loggen påverkas inte. */
  async function hide(food: FoodItem) {
    const entry = hiddenFoodEntry(food);
    await putHiddenFoods([entry]);
    await reloadFood();
    toast.show(`Dolde ${food.name} i sökningen.`, async () => {
      await deleteHiddenFoods([entry.key]);
      await reloadFood();
    });
  }

  /** Tar bort ett eget livsmedel, en måltid eller ett recept för gott (efter bekräftelse). */
  async function remove(food: FoodItem) {
    const id = food.id.slice(food.id.indexOf(':') + 1);
    if (food.source === 'maltid') await deleteMeal(id);
    else if (food.source === 'recept') await deleteRecipe(id);
    else await deleteFood(food.id);
    await reloadFood();
    toast.show(`Tog bort ${food.name}. Tidigare loggar finns kvar.`);
  }

  /** Svep vänster: Dölj direkt (med Ångra), Ta bort för egna efter bekräftelse. */
  function rowAction(food: FoodItem): { label: string; run: () => void } {
    if (isOwn(food)) {
      return {
        label: 'Ta bort',
        run: () => {
          setConfirmRemove(food);
        },
      };
    }
    return { label: 'Dölj', run: () => void hide(food) };
  }

  function openMenu(food: FoodItem) {
    if (isOwn(food)) setConfirmRemove(food);
    else setMenu(food);
  }

  async function toggleFavorite(foodId: string) {
    await setFavorite(foodId, !favoriteIds.has(foodId));
    await reloadFood();
  }

  const title =
    customTitle ??
    (mode.kind === 'ingredient'
      ? 'Lägg till ingrediens'
      : mode.meal
        ? `Lägg till i ${mealName(foodData.mealSlots, mode.meal).toLowerCase()}`
        : 'Logga mat');

  let body;
  if (quick !== null && mode.kind === 'log') {
    body = (
      <QuickLogForm
        initial={quick.initial}
        editing={null}
        date={mode.date}
        defaultMeal={mode.meal}
        mealSlots={foodData.mealSlots}
        favoriteIds={favoriteIds}
        onToggleFavorite={(foodId) => void toggleFavorite(foodId)}
        onSaved={(message, meal) => {
          setQuick(null);
          setStatus(message);
          mode.onLogged(message, meal);
        }}
        onCancel={() => {
          setQuick(null);
        }}
      />
    );
  } else if (creating !== null) {
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
        last={initialUsage ?? lastUsage(foodLog, selected.id)}
        editing={null}
        date={mode.kind === 'log' ? mode.date : ''}
        defaultMeal={mode.kind === 'log' ? mode.meal : null}
        mealSlots={foodData.mealSlots}
        favorite={favoriteIds.has(selected.id)}
        onToggleFavorite={() => void toggleFavorite(selected.id)}
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
        fiberSource={fiberSource}
        onFoodChange={(updated) => {
          setSelected(updated);
          void reloadFood();
        }}
        onLogUpdated={() => {
          void reloadLog?.();
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
        {claimFilters.length > 0 && (
          <div className="claim-filter" role="group" aria-label="Filtrera på etikett">
            {claimFilters.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip chip-small"
                aria-pressed={filters.has(c.id)}
                data-testid={`claim-filter-${c.id}`}
                onClick={() => {
                  setFilters((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(c.id)) next.add(c.id);
                    return next;
                  });
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
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
            key={rowsVersion}
            items={results}
            onPick={pick}
            rowAction={rowAction}
            onMenu={openMenu}
            after={moreRows}
            empty={
              livsmedel === null
                ? 'Laddar livsmedelsdatabasen …'
                : activeFilters.length > 0
                  ? 'Inga träffar med de valda etiketterna.'
                  : 'Inga träffar.'
            }
            testId="search-result"
            fiberSource={fiberSource}
          />
        ) : (
          lookup.kind === 'idle' && (
            <>
              {forLog && (
                <ul className="list list-flush">
                  <ListRow
                    testId="quick-log-open"
                    primary="Snabblogg"
                    secondary="Bara kcal – t.ex. restaurang eller middag hos vänner"
                    chevron
                    onClick={() => {
                      setQuick({ initial: null });
                      setStatus(null);
                    }}
                  />
                </ul>
              )}
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
                    key={rowsVersion}
                    items={byFilter(recent)}
                    onPick={pick}
                    rowAction={rowAction}
                    onMenu={openMenu}
                    empty="Inget loggat ännu. Sök efter ett livsmedel ovan."
                    testId="quick-pick"
                    fiberSource={fiberSource}
                  />
                )}
                {tab === 'favoriter' && (
                  <FoodList
                    key={rowsVersion}
                    items={byFilter(favorites)}
                    onPick={pick}
                    rowAction={rowAction}
                    onMenu={openMenu}
                    empty="Inga favoriter ännu. Tryck på stjärnan när du loggar."
                    testId="quick-pick"
                    fiberSource={fiberSource}
                  />
                )}
                {tab === 'maltider' && forLog && (
                  <FoodList
                    items={byFilter(ownDishes)}
                    onPick={pick}
                    empty="Inga sparade måltider eller recept. Skapa dem under Egna."
                    testId="quick-pick"
                    fiberSource={fiberSource}
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
        {toast.toast && (
          <Toast
            label="Sökning"
            testId="picker-toast"
            message={toast.toast.message}
            onUndo={toast.onUndo}
            onClose={toast.close}
          />
        )}
        {menu && (
          <ActionSheet
            title={menu.name}
            description="Dölj i sökning och snabbval. Tidigare loggar påverkas inte – du kan visa det igen under Inställningar → Matsökning."
            actions={[{ label: 'Dölj', danger: true, onSelect: () => void hide(menu) }]}
            onClose={() => {
              setMenu(null);
            }}
          />
        )}
        {confirmRemove && (
          <ActionSheet
            title={`Ta bort ${confirmRemove.name}?`}
            description="Tas bort för gott ur Egna, sökningen och snabbvalen. Det går inte att ångra. Tidigare loggar påverkas inte."
            actions={[
              { label: 'Ta bort', danger: true, onSelect: () => void remove(confirmRemove) },
            ]}
            onClose={() => {
              setConfirmRemove(null);
              setRowsVersion((v) => v + 1);
            }}
          />
        )}
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
