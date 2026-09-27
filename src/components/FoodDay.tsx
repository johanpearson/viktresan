import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteFoodLog,
  putFoodLog,
  saveCustomUnits,
  setFavorite,
  type FoodLogEntry,
} from '../db/db.ts';
import { daySubject, mealSubject, type AiContext } from '../lib/aiPrompt.ts';
import { todayIso } from '../lib/dates.ts';
import { buildCatalog, entryToItem, mealToItem, storedToItem } from '../lib/foodCatalog.ts';
import { currentMealSlot, savedMealName } from '../lib/foodDay.ts';
import type { FoodItem } from '../lib/foodSearch.ts';
import { formatDate, formatDayMonth } from '../lib/format.ts';
import { mealLabel, totalOf, type MealSlot } from '../lib/nutrition.ts';
import type { FoodUnit } from '../lib/units.ts';
import { AskAi } from './AskAi.tsx';
import { BottomSheet } from './BottomSheet.tsx';
import { DateBar } from './DateBar.tsx';
import { DaySummary } from './DaySummary.tsx';
import { FoodLogForm } from './FoodLogForm.tsx';
import { FoodPicker, type FoodSource } from './FoodPicker.tsx';
import { FoodToast } from './FoodToast.tsx';
import { MealAnalysisView } from './MealAnalysisView.tsx';
import { MealSections } from './MealSections.tsx';
import { SaveMealForm } from './SaveMealForm.tsx';
import { ScanIcon } from './ScanIcon.tsx';

interface FoodDayProps {
  source: FoodSource;
  targetKcal: number | null;
  proteinGoalG: number | null;
  /** Öppna sök-sheeten direkt (genvägen "Logga mat", `#/mat/logga`). */
  initialPicker?: boolean;
  onPickerClosed?: () => void;
  reloadLog: () => Promise<unknown>;
  /** Det som kan tas med i "Fråga AI" (profil, mål, GLP-1 …), `null` tills datan är läst. */
  aiContext?: AiContext | null;
}

/** Vad menyn, analysen och "Fråga AI" gäller: en måltid eller hela dagen. */
type Target = { kind: 'meal'; slot: MealSlot } | { kind: 'day' };

interface AnalysisState {
  target: Target;
  view: 'analysis' | 'ai';
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
  aiContext = null,
}: FoodDayProps) {
  const { foodData, livsmedel, foodLog, reloadFood } = source;
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [picker, setPicker] = useState<Picker | null>(() =>
    initialPicker ? { meal: null, scan: false, focus: true } : null,
  );
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [menu, setMenu] = useState<Target | null>(null);
  const [saving, setSaving] = useState<MealSlot | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
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

  async function swipeFavorite(entry: FoodLogEntry) {
    const was = favoriteIds.has(entry.foodId);
    await toggleFavorite(entry.foodId);
    setToast({
      message: was
        ? `Tog bort ${entry.name} från favoriterna.`
        : `La till ${entry.name} som favorit.`,
    });
  }

  function entriesFor(target: Target): FoodLogEntry[] {
    return target.kind === 'day' ? entries : entries.filter((e) => e.meal === target.slot);
  }

  function targetTitle(target: Target): string {
    return target.kind === 'day'
      ? `dagen ${formatDayMonth(date)}`
      : `${mealLabel(target.slot).toLowerCase()} ${formatDayMonth(date)}`;
  }

  const analysisEntries = analysis ? entriesFor(analysis.target) : [];
  return (
    <>
      <div className="food-top" ref={summaryRef}>
        <div className="food-day-head">
          <DateBar date={date} today={today} onChange={setDate} />
          {entries.length > 0 && (
            <button
              type="button"
              className="icon-button day-menu"
              aria-label="Fler val för dagen"
              aria-haspopup="dialog"
              onClick={() => {
                setMenu({ kind: 'day' });
              }}
            >
              <span aria-hidden="true">⋯</span>
            </button>
          )}
        </div>
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
        favoriteIds={favoriteIds}
        onMenu={(slot) => {
          setMenu({ kind: 'meal', slot });
        }}
        onToggleFavorite={(entry) => void swipeFavorite(entry)}
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
      {menu && (
        <BottomSheet
          title={menu.kind === 'day' ? 'Dagen' : mealLabel(menu.slot)}
          onClose={() => {
            setMenu(null);
          }}
        >
          <div className="action-list">
            {menu.kind === 'meal' && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setMenu(null);
                  setSaving(menu.slot);
                }}
              >
                Spara som egen måltid
              </button>
            )}
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setMenu(null);
                setAnalysis({ target: menu, view: 'analysis' });
              }}
            >
              Analysera
            </button>
          </div>
        </BottomSheet>
      )}
      {saving && (
        <BottomSheet
          title="Spara som egen måltid"
          onClose={() => {
            setSaving(null);
          }}
        >
          <SaveMealForm
            defaultName={savedMealName(saving, date)}
            entries={entries.filter((e) => e.meal === saving)}
            meals={foodData.meals}
            onSaved={(meal) => {
              setSaving(null);
              void reloadFood().then(() => {
                setToast({ message: `Sparade ${meal.name} under Måltider.` });
              });
            }}
            onCancel={() => {
              setSaving(null);
            }}
          />
        </BottomSheet>
      )}
      {analysis && (
        <BottomSheet
          full
          title={
            analysis.view === 'ai'
              ? `Fråga AI om ${targetTitle(analysis.target)}`
              : `Analys av ${targetTitle(analysis.target)}`
          }
          onClose={() => {
            setAnalysis(null);
          }}
        >
          {analysis.view === 'analysis' ? (
            <MealAnalysisView
              entries={analysisEntries}
              meals={foodData.meals}
              catalog={catalog}
              foods={livsmedel?.foods ?? NO_FOODS}
              goals={{
                targetKcal,
                proteinGoalG,
              }}
              what={analysis.target.kind === 'day' ? 'dagen' : 'måltiden'}
              onAskAi={() => {
                setAnalysis({ ...analysis, view: 'ai' });
              }}
            />
          ) : (
            <>
              <button
                type="button"
                className="button button-secondary button-small back-button"
                onClick={() => {
                  setAnalysis({ ...analysis, view: 'analysis' });
                }}
              >
                ‹ Tillbaka till analysen
              </button>
              {aiContext ? (
                <AskAi
                  subject={
                    analysis.target.kind === 'day'
                      ? daySubject(analysisEntries, date)
                      : mealSubject(analysisEntries, analysis.target.slot, date)
                  }
                  context={{ ...aiContext, dayIntake: totals }}
                />
              ) : (
                <p className="muted">Laddar …</p>
              )}
            </>
          )}
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
