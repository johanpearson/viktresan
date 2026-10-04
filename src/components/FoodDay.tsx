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
import {
  buildCatalog,
  entryToItem,
  fiberSourceFor,
  mealToItem,
  storedItems,
} from '../lib/foodCatalog.ts';
import { quickValuesOf } from '../lib/quickLog.ts';
import { recipeToItem } from '../lib/recipes.ts';
import { weekBudget } from '../lib/weekBudget.ts';
import { filtersFrom, visibleFoods } from '../lib/foodFilters.ts';
import { fiberOfEntries, type FiberGoal } from '../lib/fiber.ts';
import { savedMealName } from '../lib/foodDay.ts';
import type { FoodItem } from '../lib/foodSearch.ts';
import { formatDate, formatDayMonth } from '../lib/format.ts';
import { haptic } from '../lib/haptics.ts';
import { currentMealId, mealName, resolveMealId, type MealId } from '../lib/mealSlots.ts';
import { dailyIntake, totalOf } from '../lib/nutrition.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import type { FoodUnit } from '../lib/units.ts';
import { gapClaims, gapText, largeGaps, whatToEatSubject } from '../lib/whatToEat.ts';
import { AskAi } from './AskAi.tsx';
import { BottomSheet } from './BottomSheet.tsx';
import { DateBar } from './DateBar.tsx';
import { DaySummary } from './DaySummary.tsx';
import { FoodLogForm } from './FoodLogForm.tsx';
import { FoodPicker, type FoodSource } from './FoodPicker.tsx';
import { IconTipButton } from './IconTipButton.tsx';
import { ListRow } from './ListRow.tsx';
import { MealAnalysisView } from './MealAnalysisView.tsx';
import { MealSections } from './MealSections.tsx';
import { QuickLogForm } from './QuickLogForm.tsx';
import { SaveMealForm } from './SaveMealForm.tsx';
import { ScanIcon } from './ScanIcon.tsx';
import { SparklesIcon } from './SparklesIcon.tsx';
import { Toast } from './Toast.tsx';

interface FoodDayProps {
  source: FoodSource;
  /** Dagsmålet (planens kalorimål). Veckobudgeten = 7 × dagsmålet. */
  targetKcal: number | null;
  /** Kalorigolvet – veckoradens per dag-förslag går aldrig under det. */
  floorKcal: number | null;
  proteinGoalG: number | null;
  /** Fibermålet ett datum, `null` när fibermålet inte visas. */
  fiberGoalOn?: (date: string) => FiberGoal | null;
  /** Öppna sök-sheeten direkt (genvägen "Logga mat", `#/mat/logga`). */
  initialPicker?: boolean;
  /** Slå upp streckkoden i sök-sheeten direkt (`#/mat/ean/<ean>`, från Tillskott). */
  initialEan?: string | undefined;
  reloadLog: () => Promise<unknown>;
  /** Det som kan tas med i "Fråga AI" (profil, mål, GLP-1 …), `null` tills datan är läst. */
  aiContext?: AiContext | null;
  /** Fiber att sikta på (gapraden, Vad ska jag äta?) när fibermålet inte visas (referensvärdet, NNR 2023). */
  fiberReferenceG?: number | null;
}

/** Vad menyn, analysen och "Fråga AI" gäller: en måltid eller hela dagen. */
type Target = { kind: 'meal'; slot: MealId } | { kind: 'day' };

interface AnalysisState {
  target: Target;
  view: 'analysis' | 'ai';
}

interface Picker {
  meal: MealId | null;
  scan: boolean;
  focus: boolean;
  /** Streckkod att slå upp direkt (länk från Tillskott). */
  ean?: string;
}

interface ToastState {
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
  floorKcal,
  proteinGoalG,
  fiberGoalOn,
  initialPicker = false,
  initialEan,
  reloadLog,
  aiContext = null,
  fiberReferenceG = null,
}: FoodDayProps) {
  const { foodData, livsmedel, foodLog, reloadFood } = source;
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [picker, setPicker] = useState<Picker | null>(() =>
    initialEan
      ? { meal: null, scan: false, focus: false, ean: initialEan }
      : initialPicker
        ? { meal: null, scan: false, focus: true }
        : null,
  );
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [menu, setMenu] = useState<Target | null>(null);
  const [saving, setSaving] = useState<MealId | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  // "Vad ska jag äta?": måltiden prompten byggs för.
  const [eat, setEat] = useState<MealId | null>(null);
  const { mealSlots } = foodData;
  // Pågående måltid (efter klockslaget) är utfälld från start, övriga ihopfällda.
  const [open, setOpen] = useState<ReadonlySet<MealId>>(
    () => new Set([currentMealId(mealSlots)].filter((id) => id !== null)),
  );
  const { loaded: prefsLoaded, prefs } = usePreferences();
  const markTipSeen = useCallback(() => {
    void setPreference('whatToEatTipSeen', true);
  }, []);
  const [compact, setCompact] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  const catalog = useMemo(
    () =>
      buildCatalog(
        livsmedel?.foods ?? NO_FOODS,
        storedItems(foodData),
        foodData.meals.map(mealToItem),
        foodData.recipes.map(recipeToItem),
      ),
    [livsmedel, foodData],
  );
  // Fiber per post ur katalogen – först när Livsmedelsverkets data finns (annars utelämnas fibern).
  const fiberSource = useMemo(
    () => (livsmedel ? fiberSourceFor(catalog, foodData) : null),
    [livsmedel, catalog, foodData],
  );
  // Dolt i matsökningen nämns inte i "Vad ska jag äta?" och föreslås inte som byte.
  const hiddenFilters = useMemo(() => filtersFrom(foodData.hidden), [foodData.hidden]);
  const customUnits = useMemo(
    () => new Map(foodData.foodUnits.map((u) => [u.foodId, u.units])),
    [foodData.foodUnits],
  );
  const favoriteIds = new Set(foodData.favorites.map((f) => f.foodId));

  const entries = foodLog.filter((e) => e.date === date);
  const totals = totalOf(entries);
  const fiberGoal = fiberGoalOn?.(date) ?? null;
  const fiberTotal = fiberSource ? fiberOfEntries(entries, fiberSource) : null;
  const fiber = fiberGoal ? { goal: fiberGoal, total: fiberTotal } : null;
  // Veckoraden gäller veckan som det valda datumet ligger i (en avslutad vecka visar saldot).
  const week =
    targetKcal === null || floorKcal === null || date > today
      ? null
      : weekBudget({
          dailyTargetKcal: targetKcal,
          floorKcal,
          intake: dailyIntake(foodLog),
          today,
          weekOf: date,
        });
  const when = date === today ? 'idag' : formatDate(date);
  // Gapraden och "Vad ska jag äta?" gäller det som är kvar av dagens mål – bara idag.
  const isToday = date === today;
  const goals = { targetKcal, proteinGoalG, fiberGoalG: fiberGoal?.goalG ?? fiberReferenceG };
  const eaten = {
    kcal: totals.kcal,
    proteinG: totals.proteinG,
    fiberG: fiberTotal?.fiberG ?? null,
  };
  const gaps = isToday ? largeGaps(eaten, goals) : [];

  // Den fulla summeringen utom synhåll → visa miniraden i den sticky toppen.
  useEffect(() => {
    const el = summaryRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // Minus sidhuvudets och sökfältets höjd: summeringen räknas som dold när den ligger under sökraden.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setCompact(!entry.isIntersecting);
      },
      { rootMargin: '-128px 0px 0px 0px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Analys → Fråga AI byter innehåll i samma panel: börja överst, inte där analysen var scrollad.
  const analysisView = analysis?.view;
  useEffect(() => {
    if (analysisView === 'ai') backRef.current?.closest('dialog')?.scrollTo({ top: 0 });
  }, [analysisView]);

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  function expand(slot: MealId) {
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
    expand(resolveMealId(mealSlots, entry.meal, entry.createdAt));
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
    return target.kind === 'day' ? entries : entriesIn(target.slot);
  }

  function entriesIn(slot: MealId): FoodLogEntry[] {
    return entries.filter((e) => resolveMealId(mealSlots, e.meal, e.createdAt) === slot);
  }

  function targetTitle(target: Target): string {
    return target.kind === 'day'
      ? `dagen ${formatDayMonth(date)}`
      : `${mealName(mealSlots, target.slot).toLowerCase()} ${formatDayMonth(date)}`;
  }

  const analysisEntries = analysis ? entriesFor(analysis.target) : [];
  return (
    <>
      <div className="food-top" ref={summaryRef}>
        <div className="food-day-head">
          <DateBar date={date} today={today} onChange={setDate} />
          {isToday && (
            <IconTipButton
              label="Vad ska jag äta?"
              icon={<SparklesIcon />}
              className="what-to-eat-button"
              testId="what-to-eat"
              showTip={prefsLoaded && !prefs.whatToEatTipSeen}
              onTipShown={markTipSeen}
              onClick={() => {
                setEat(currentMealId(mealSlots));
              }}
            />
          )}
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
          fiber={fiber}
          fiberDay={fiberTotal}
          when={when}
          week={week}
          gapText={gapText(gaps)}
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
            <span className="search-open-text">Sök och logga mat</span>
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
        mealSlots={mealSlots}
        open={open}
        favoriteIds={favoriteIds}
        fiberSource={fiberSource}
        menuAlways={isToday}
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
          ean={picker.ean}
          firstClaims={gapClaims(gaps)}
          mode={{
            kind: 'log',
            date,
            meal: picker.meal,
            onLogged: (_message, meal) => {
              haptic('success');
              expand(meal);
              void reloadLog();
            },
          }}
          onClose={() => {
            setPicker(null);
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
          {editing.estimated ? (
            <QuickLogForm
              key={editing.id}
              initial={quickValuesOf({ ...editing, id: editing.foodId })}
              editing={editing}
              mealSlots={mealSlots}
              date={date}
              favoriteIds={favoriteIds}
              onToggleFavorite={(foodId) => void toggleFavorite(foodId)}
              onSaved={(message, meal) => {
                haptic('success');
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
          ) : (
            <FoodLogForm
              key={editing.id}
              food={itemForEntry(editing, catalog)}
              customUnits={customUnits.get(editing.foodId) ?? NO_UNITS}
              last={null}
              editing={editing}
              mealSlots={mealSlots}
              date={date}
              favorite={favoriteIds.has(editing.foodId)}
              onToggleFavorite={() => void toggleFavorite(editing.foodId)}
              onUnitsChange={async (units) => {
                await saveCustomUnits(editing.foodId, units);
                await reloadFood();
              }}
              onSaved={(message, meal) => {
                haptic('success');
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
              fiberSource={fiberSource}
            />
          )}
        </BottomSheet>
      )}
      {menu && (
        <BottomSheet
          title={menu.kind === 'day' ? 'Dagen' : mealName(mealSlots, menu.slot)}
          onClose={() => {
            setMenu(null);
          }}
        >
          <ul className="list action-list">
            {menu.kind === 'meal' && isToday && (
              <ListRow
                primary="Vad ska jag äta?"
                secondary="En fråga till AI utifrån det som är kvar idag"
                chevron
                onClick={() => {
                  setMenu(null);
                  setEat(menu.slot);
                }}
              />
            )}
            {entriesFor(menu).length > 0 && (
              <>
                {menu.kind === 'meal' && (
                  <ListRow
                    primary="Spara som egen måltid"
                    chevron
                    onClick={() => {
                      setMenu(null);
                      setSaving(menu.slot);
                    }}
                  />
                )}
                <ListRow
                  primary="Analysera"
                  chevron
                  onClick={() => {
                    setMenu(null);
                    setAnalysis({ target: menu, view: 'analysis' });
                  }}
                />
              </>
            )}
          </ul>
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
            defaultName={savedMealName(mealName(mealSlots, saving), date)}
            entries={entriesIn(saving)}
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
              foods={visibleFoods(livsmedel?.foods ?? NO_FOODS, hiddenFilters)}
              goals={{
                targetKcal,
                proteinGoalG,
                fiberGoalG: fiberGoal?.goalG ?? null,
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
                ref={backRef}
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
                      ? daySubject(analysisEntries, date, mealSlots)
                      : mealSubject(
                          analysisEntries,
                          mealName(mealSlots, analysis.target.slot),
                          date,
                        )
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
      {eat && (
        <BottomSheet
          full
          title={`Vad ska jag äta till ${mealName(mealSlots, eat).toLowerCase()}?`}
          onClose={() => {
            setEat(null);
          }}
        >
          {aiContext ? (
            <AskAi
              subject={whatToEatSubject({
                meal: { id: eat, name: mealName(mealSlots, eat) },
                today,
                log: foodLog,
                eaten,
                goals,
                hidden: hiddenFilters.ids,
              })}
              context={aiContext}
            />
          ) : (
            <p className="muted">Laddar …</p>
          )}
        </BottomSheet>
      )}
      {toast && (
        <Toast
          label="Mat"
          testId="food-toast"
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
