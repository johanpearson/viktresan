import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteFoodLog,
  putFoodLog,
  saveCustomUnits,
  setFavorite,
  type FoodLogEntry,
} from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { buildCatalog, entryToItem, mealToItem, storedToItem } from '../lib/foodCatalog.ts';
import { currentMealSlot } from '../lib/foodDay.ts';
import type { FoodItem } from '../lib/foodSearch.ts';
import { formatDate } from '../lib/format.ts';
import { totalOf, type MealSlot } from '../lib/nutrition.ts';
import type { FoodUnit } from '../lib/units.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { DateBar } from './DateBar.tsx';
import { DaySummary } from './DaySummary.tsx';
import { FoodLogForm } from './FoodLogForm.tsx';
import { FoodPicker, type FoodSource } from './FoodPicker.tsx';
import { FoodToast } from './FoodToast.tsx';
import { MealSections } from './MealSections.tsx';
import { ScanIcon } from './ScanIcon.tsx';

interface FoodDayProps {
  source: FoodSource;
  targetKcal: number | null;
  proteinGoalG: number | null;
  /** Öppna sök-sheeten direkt (genvägen "Logga mat", `#/mat/logga`). */
  initialPicker?: boolean;
  onPickerClosed?: () => void;
  reloadLog: () => Promise<unknown>;
}

interface Picker {
  meal: MealSlot | null;
  scan: boolean;
  focus: boolean;
}

interface Toast {
  message: string;
  /** Borttagen post som Ångra lägger tillbaka. */
  removed?: FoodLogEntry;
}

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

/**
 * Mat → Dag: datumrad, kalorier och protein (krymper till en sticky rad vid
 * scroll), sökfält som öppnar sök-sheeten och dagens mat per måltid.
 */
export function FoodDay({
  source,
  targetKcal,
  proteinGoalG,
  initialPicker = false,
  onPickerClosed,
  reloadLog,
}: FoodDayProps) {
  const { foodData, livsmedel, foodLog, reloadFood } = source;
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [picker, setPicker] = useState<Picker | null>(() =>
    initialPicker ? { meal: null, scan: false, focus: true } : null,
  );
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // Pågående måltid (efter klockslaget) är utfälld från start, övriga ihopfällda.
  const [open, setOpen] = useState<ReadonlySet<MealSlot>>(() => new Set([currentMealSlot()]));
  const [compact, setCompact] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const catalog = useMemo(
    () =>
      buildCatalog(
        livsmedel?.foods ?? NO_FOODS,
        foodData.foods.map(storedToItem),
        foodData.meals.map(mealToItem),
      ),
    [livsmedel, foodData.foods, foodData.meals],
  );
  const customUnits = useMemo(
    () => new Map(foodData.foodUnits.map((u) => [u.foodId, u.units])),
    [foodData.foodUnits],
  );
  const favoriteIds = new Set(foodData.favorites.map((f) => f.foodId));

  const entries = foodLog.filter((e) => e.date === date);
  const totals = totalOf(entries);
  const when = date === today ? 'idag' : formatDate(date);

  // Den fulla summeringen utom synhåll → visa miniraden i den sticky toppen.
  useEffect(() => {
    const el = summaryRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // Minus sökfältets höjd: summeringen räknas som dold när den ligger under sökraden.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setCompact(!entry.isIntersecting);
      },
      { rootMargin: '-72px 0px 0px 0px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  function expand(slot: MealSlot) {
    setOpen((prev) => new Set(prev).add(slot));
  }

  async function remove(entry: FoodLogEntry) {
    await deleteFoodLog(entry.id);
    await reloadLog();
    setToast({ message: `Tog bort ${entry.name}.`, removed: entry });
  }

  async function undo(entry: FoodLogEntry) {
    await putFoodLog(entry);
    await reloadLog();
    expand(entry.meal);
    setToast({ message: `Ångrade – ${entry.name} är tillbaka.` });
  }

  async function toggleFavorite(foodId: string) {
    await setFavorite(foodId, !favoriteIds.has(foodId));
    await reloadFood();
  }

  return (
    <>
      <div className="food-top" ref={summaryRef}>
        <DateBar date={date} today={today} onChange={setDate} />
        <DaySummary
          totals={totals}
          targetKcal={targetKcal}
          proteinGoalG={proteinGoalG}
          when={when}
        />
      </div>
      <div className="food-sticky" data-compact={compact ? 'true' : 'false'}>
        {compact && (
          <DaySummary
            variant="mini"
            totals={totals}
            targetKcal={targetKcal}
            proteinGoalG={proteinGoalG}
            when={when}
          />
        )}
        <div className="search-bar">
          <button
            type="button"
            className="search-open"
            onClick={() => {
              setPicker({ meal: null, scan: false, focus: true });
            }}
          >
            <span aria-hidden="true" className="search-icon" />
            Sök och logga mat
          </button>
          <button
            type="button"
            className="icon-button scan-button"
            aria-label="Skanna streckkod"
            onClick={() => {
              setPicker({ meal: null, scan: true, focus: false });
            }}
          >
            <ScanIcon />
          </button>
        </div>
      </div>
      <MealSections
        entries={entries}
        meals={foodData.meals}
        open={open}
        onToggle={(slot) => {
          setOpen((prev) => {
            const next = new Set(prev);
            if (!next.delete(slot)) next.add(slot);
            return next;
          });
        }}
        onAdd={(slot) => {
          setPicker({ meal: slot, scan: false, focus: false });
        }}
        onEdit={setEditing}
        onDelete={(entry) => void remove(entry)}
      />
      {picker && (
        <FoodPicker
          source={source}
          scan={picker.scan}
          focusSearch={picker.focus}
          mode={{
            kind: 'log',
            date,
            meal: picker.meal,
            onLogged: (_message, meal) => {
              expand(meal);
              void reloadLog();
            },
          }}
          onClose={() => {
            setPicker(null);
            onPickerClosed?.();
          }}
        />
      )}
      {editing && (
        <BottomSheet
          title="Redigera post"
          onClose={() => {
            setEditing(null);
          }}
        >
          <FoodLogForm
            key={editing.id}
            food={itemForEntry(editing, catalog)}
            customUnits={customUnits.get(editing.foodId) ?? NO_UNITS}
            last={null}
            editing={editing}
            date={date}
            favorite={favoriteIds.has(editing.foodId)}
            onToggleFavorite={() => void toggleFavorite(editing.foodId)}
            onUnitsChange={async (units) => {
              await saveCustomUnits(editing.foodId, units);
              await reloadFood();
            }}
            onSaved={(message, meal) => {
              setEditing(null);
              expand(meal);
              void reloadLog().then(() => {
                setToast({ message });
              });
            }}
            onDelete={() => {
              const entry = editing;
              setEditing(null);
              void remove(entry);
            }}
            onCancel={() => {
              setEditing(null);
            }}
          />
        </BottomSheet>
      )}
      {toast && (
        <FoodToast
          message={toast.message}
          onUndo={
            toast.removed
              ? () => {
                  const entry = toast.removed;
                  if (entry) void undo(entry);
                }
              : undefined
          }
          onClose={closeToast}
        />
      )}
    </>
  );
}
