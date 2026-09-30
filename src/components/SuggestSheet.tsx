import { useCallback, useMemo, useState } from 'react';
import { deleteFoodLog, newId, putFoodLogEntries, type FoodLogEntry } from '../db/db.ts';
import type { AiContext } from '../lib/aiPrompt.ts';
import type { FiberSource } from '../lib/fiber.ts';
import type { FoodItem } from '../lib/foodSearch.ts';
import { formatKcal } from '../lib/format.ts';
import { haptic } from '../lib/haptics.ts';
import { MEAL_SLOTS, mealLabel, type MealSlot } from '../lib/nutrition.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import {
  SUGGESTION_PAGE,
  amountText,
  buildSuggestions,
  commonFoods,
  effectText,
  suggestionEntries,
  type Goals,
  type Suggestion,
  type SuggestionPart,
} from '../lib/suggestions.ts';
import type { FoodUnit } from '../lib/units.ts';
import { AskAi } from './AskAi.tsx';
import { BottomSheet } from './BottomSheet.tsx';
import { ClaimTags } from './ClaimTags.tsx';
import { EmptyState } from './EmptyState.tsx';
import { FoodLogForm } from './FoodLogForm.tsx';
import type { FoodSource } from './FoodPicker.tsx';
import { SegmentedControl } from './SegmentedControl.tsx';
import { ShowMore } from './ShowMore.tsx';
import { Toast } from './Toast.tsx';

interface SuggestSheetProps {
  /** Måltiden sheeten öppnas för (pågående måltid eller måltidens ⋯). */
  initialSlot: MealSlot;
  /** Dagen förslagen gäller (idag). */
  date: string;
  source: FoodSource;
  /** Alla livsmedel, måltider och recept (id → livsmedel). */
  catalog: ReadonlyMap<string, FoodItem>;
  customUnits: ReadonlyMap<string, readonly FoodUnit[]>;
  fiberSource: FiberSource | null;
  goals: Goals;
  aiContext: AiContext | null;
  favoriteIds: ReadonlySet<string>;
  onToggleFavorite: (foodId: string) => void;
  onUnitsChange: (foodId: string, units: FoodUnit[]) => Promise<void>;
  reloadLog: () => Promise<unknown>;
  /** Något loggades i måltiden (Mat → Dag fäller ut den). */
  onLogged: (meal: MealSlot) => void;
  onClose: () => void;
}

interface ToastState {
  message: string;
  /** Loggade poster som Ångra tar bort … */
  logged?: FoodLogEntry[];
  /** … eller ett dolt förslag som Ångra visar igen. */
  hidden?: string;
}

/** Justera: logg-sheeten förifylld, en del i taget för en kombination. */
interface Adjusting {
  parts: SuggestionPart[];
  index: number;
}

const SLOT_OPTIONS = MEAL_SLOTS.map((m) => ({ id: m.id, label: m.label }));

/**
 * "Föreslå" (Mat): upp till tre förslag i taget för en måltid utifrån det man brukar äta och
 * dagens kvarvarande kcal, protein och fiber. Logga direkt (Ångra i toasten), Justera i
 * logg-sheeten, "Inte intresserad" döljer förslaget. "Något nytt" bygger en AI-prompt.
 * Allt räknas lokalt (`suggestions.ts`).
 */
export function SuggestSheet({
  initialSlot,
  date,
  source,
  catalog,
  customUnits,
  fiberSource,
  goals,
  aiContext,
  favoriteIds,
  onToggleFavorite,
  onUnitsChange,
  reloadLog,
  onLogged,
  onClose,
}: SuggestSheetProps) {
  const { foodData, foodLog } = source;
  const { targetKcal, proteinGoalG, fiberGoalG } = goals;
  const { prefs } = usePreferences();
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [shown, setShown] = useState(SUGGESTION_PAGE);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [adjusting, setAdjusting] = useState<Adjusting | null>(null);
  const [asking, setAsking] = useState(false);
  const hidden = prefs.suggestionsHidden;

  const dishes = useMemo(
    () => [...catalog.values()].filter((f) => f.source === 'maltid' || f.source === 'recept'),
    [catalog],
  );
  const result = useMemo(
    () =>
      buildSuggestions({
        slot,
        today: date,
        hour: new Date().getHours(),
        log: foodLog,
        catalog,
        favorites: foodData.favorites,
        dishes,
        customUnits,
        hidden,
        goals: { targetKcal, proteinGoalG, fiberGoalG },
        fiberSource,
      }),
    [
      slot,
      date,
      foodLog,
      catalog,
      foodData.favorites,
      dishes,
      customUnits,
      hidden,
      targetKcal,
      proteinGoalG,
      fiberGoalG,
      fiberSource,
    ],
  );
  const low = result.mode === 'low';
  const visible = result.suggestions.slice(0, shown);
  const more = Math.min(SUGGESTION_PAGE, result.suggestions.length - visible.length);
  const slotName = mealLabel(slot).toLowerCase();

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  async function log(s: Suggestion) {
    const entries = suggestionEntries(s, slot, date, newId);
    await putFoodLogEntries(entries);
    haptic('success');
    await reloadLog();
    onLogged(slot);
    setToast({ message: `Loggade ${s.name} till ${slotName}.`, logged: entries });
  }

  async function undoLog(entries: readonly FoodLogEntry[]) {
    for (const e of entries) await deleteFoodLog(e.id);
    await reloadLog();
    setToast({ message: 'Ångrade – förslaget är inte loggat.' });
  }

  function hide(s: Suggestion) {
    void setPreference('suggestionsHidden', [...hidden, { key: s.key, name: s.name }]);
    setToast({ message: `Visar inte ${s.name} som förslag.`, hidden: s.key });
  }

  function unhide(key: string) {
    void setPreference(
      'suggestionsHidden',
      prefs.suggestionsHidden.filter((h) => h.key !== key),
    );
    setToast(null);
  }

  const part = adjusting ? adjusting.parts[adjusting.index] : undefined;

  return (
    <BottomSheet title="Föreslå" onClose={onClose}>
      <div className="suggest" data-testid="suggest">
        <SegmentedControl
          label="Måltid"
          className="suggest-slots"
          options={SLOT_OPTIONS}
          value={slot}
          onChange={(next) => {
            setSlot(next);
            setShown(SUGGESTION_PAGE);
          }}
        />
        <p
          className="suggest-status"
          data-testid="suggest-status"
          data-mode={result.mode}
          data-remaining-kcal={
            result.remaining.kcal === null ? undefined : Math.round(result.remaining.kcal)
          }
        >
          {result.status}
        </p>
        {result.mode === 'empty' ? (
          <EmptyState
            title="Inga förslag just nu"
            action={{
              label: 'Något nytt',
              onClick: () => {
                setAsking(true);
              },
            }}
          >
            Förslagen bygger på det du loggat de senaste 28 dagarna och på en startlista med vanliga
            livsmedel. Just nu finns inget som passar {slotName} och det som är kvar av dagen –
            logga några måltider så blir förslagen dina egna, eller få idéer från AI.
          </EmptyState>
        ) : (
          <>
            <ul className="suggest-list" aria-label={`Förslag till ${slotName}`}>
              {visible.map((s) => (
                <SuggestionItem
                  key={s.key}
                  suggestion={s}
                  effect={effectText(s.values, result.remaining, low)}
                  onLog={() => void log(s)}
                  onAdjust={() => {
                    setToast(null);
                    setAdjusting({ parts: s.parts, index: 0 });
                  }}
                  onHide={() => {
                    hide(s);
                  }}
                />
              ))}
            </ul>
            <ShowMore
              hidden={more}
              onClick={() => {
                setShown((n) => n + SUGGESTION_PAGE);
              }}
            >
              Visa fler
            </ShowMore>
            <button
              type="button"
              className="button button-secondary suggest-ai"
              onClick={() => {
                setAsking(true);
              }}
            >
              Något nytt
            </button>
            <p className="form-note muted">
              Förslagen räknas fram i appen utifrån det du brukar äta. "Något nytt" bygger en fråga
              till en AI-tjänst som du själv väljer att dela.
            </p>
          </>
        )}
        {toast && (
          <Toast
            label="Föreslå"
            testId="suggest-toast"
            message={toast.message}
            onUndo={
              toast.logged
                ? () => {
                    const entries = toast.logged;
                    if (entries) void undoLog(entries);
                  }
                : toast.hidden !== undefined
                  ? () => {
                      if (toast.hidden !== undefined) unhide(toast.hidden);
                    }
                  : undefined
            }
            onClose={closeToast}
          />
        )}
      </div>
      {part && adjusting && (
        <BottomSheet
          title={
            adjusting.parts.length > 1
              ? `Justera (${String(adjusting.index + 1)} av ${String(adjusting.parts.length)})`
              : 'Justera'
          }
          onClose={() => {
            setAdjusting(null);
          }}
        >
          <FoodLogForm
            key={`${part.food.id}:${String(adjusting.index)}`}
            food={part.food}
            customUnits={customUnits.get(part.food.id) ?? []}
            last={{ unit: part.unit, amount: part.amount }}
            editing={null}
            date={date}
            defaultMeal={slot}
            favorite={favoriteIds.has(part.food.id)}
            onToggleFavorite={() => {
              onToggleFavorite(part.food.id);
            }}
            onUnitsChange={(units) => onUnitsChange(part.food.id, units)}
            onSaved={(message, meal) => {
              haptic('success');
              onLogged(meal);
              const next = adjusting.index + 1;
              if (next < adjusting.parts.length) setAdjusting({ ...adjusting, index: next });
              else setAdjusting(null);
              void reloadLog().then(() => {
                setToast({ message });
              });
            }}
            onCancel={() => {
              setAdjusting(null);
            }}
            fiberSource={fiberSource}
          />
        </BottomSheet>
      )}
      {asking && (
        <BottomSheet
          full
          title={`Något nytt till ${slotName}`}
          onClose={() => {
            setAsking(false);
          }}
        >
          {aiContext ? (
            <AskAi
              subject={{
                kind: 'suggest',
                meal: slot,
                remaining: result.remaining,
                typicalKcal: result.typicalKcal,
                homeFoods: commonFoods(foodLog, date),
              }}
              context={aiContext}
            />
          ) : (
            <p className="muted">Laddar …</p>
          )}
        </BottomSheet>
      )}
    </BottomSheet>
  );
}

interface SuggestionItemProps {
  suggestion: Suggestion;
  effect: string;
  onLog: () => void;
  onAdjust: () => void;
  onHide: () => void;
}

/** Ett förslag: namn med etiketter, mängd, kcal och effekt, sedan Logga · Justera · Inte intresserad. */
function SuggestionItem({ suggestion: s, effect, onLog, onAdjust, onHide }: SuggestionItemProps) {
  return (
    <li
      className="suggest-item"
      data-testid="suggestion"
      data-key={s.key}
      data-kcal={Math.round(s.values.kcal)}
      data-general={s.general ? 'true' : 'false'}
    >
      <div className="suggest-main">
        <p className="suggest-name">
          <span data-testid="suggestion-name">{s.name}</span>
          <ClaimTags claims={s.claims} />
          {s.general && (
            <span className="tag tag-source tag-general" data-testid="general-tag">
              Allmänt förslag
            </span>
          )}
        </p>
        <span className="kcal" data-testid="suggestion-kcal">
          {formatKcal(s.values.kcal)}
        </span>
      </div>
      <p className="suggest-amount">{amountText(s.parts)}</p>
      {effect !== '' && (
        <p className="suggest-effect" data-testid="suggestion-effect">
          {effect}
        </p>
      )}
      <div className="suggest-actions">
        <button
          type="button"
          className="button button-secondary button-small"
          aria-label={`Logga ${s.name}`}
          onClick={onLog}
        >
          Logga
        </button>
        <button
          type="button"
          className="button button-ghost button-small"
          aria-label={`Justera ${s.name}`}
          onClick={onAdjust}
        >
          Justera
        </button>
        <button
          type="button"
          className="button button-ghost button-small suggest-dismiss"
          aria-label={`Inte intresserad av ${s.name}`}
          onClick={onHide}
        >
          Inte intresserad
        </button>
      </div>
    </li>
  );
}
