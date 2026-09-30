import { useState, type SyntheticEvent } from 'react';
import { newId, putFoodLog, type FoodLogEntry } from '../db/db.ts';
import { claimsFor } from '../lib/claims.ts';
import { fiberForItem, type FiberSource } from '../lib/fiber.ts';
import { entryUnit } from '../lib/foodCatalog.ts';
import { hasNutritionStatus } from '../lib/foodNutrition.ts';
import { SOURCE_LABELS, type FoodItem } from '../lib/foodSearch.ts';
import { decimalInput, formatGrams, formatInt, formatKcal, parseDecimal } from '../lib/format.ts';
import {
  MEAL_SLOTS,
  defaultMealSlot,
  mealLabel,
  scaleNutrients,
  type MealSlot,
} from '../lib/nutrition.ts';
import {
  GRAM,
  MAX_GRAMS,
  QUICK_AMOUNTS,
  QUICK_AMOUNT_UNITS,
  amountLabel,
  baseOf,
  builtInUnits,
  confirmGuess,
  formatBase,
  gramsPerUnit,
  guessQuestion,
  initialUsage,
  isGram,
  isGuess,
  loggedAmountText,
  mergeUnits,
  parseUnitAmount,
  type FoodUnit,
  type Usage,
} from '../lib/units.ts';
import { PORTION_UNIT, RECIPE_PORTIONS } from '../lib/recipes.ts';
import { ClaimTags } from './ClaimTags.tsx';
import { ListRow } from './ListRow.tsx';
import { LogUpdateOffer } from './LogUpdateOffer.tsx';
import { Macros } from './Macros.tsx';
import { NutritionCompleteForm } from './NutritionCompleteForm.tsx';
import { NutritionStatus } from './NutritionStatus.tsx';
import { UnitList } from './UnitList.tsx';

interface FoodLogFormProps {
  food: FoodItem;
  /** Användarens egna enheter för livsmedlet. */
  customUnits: readonly FoodUnit[];
  /**
   * `log` sparar en post i matloggen; `ingredient` lämnar tillbaka mängd och
   * enhet (ingrediens i en egen måltid) utan måltidsval.
   */
  purpose?: 'log' | 'ingredient';
  /** Senast använda enhet och mängd (förifylls för nya poster). */
  last: Usage | null;
  /** Posten som redigeras, annars loggas en ny. */
  editing: FoodLogEntry | null;
  date: string;
  /** Förvald måltid för nya poster, annars efter klockslaget. */
  defaultMeal?: MealSlot | null;
  favorite: boolean;
  onToggleFavorite: () => void;
  /** Sparar livsmedlets egna enheter och laddar om. */
  onUnitsChange: (units: FoodUnit[]) => Promise<void>;
  onSaved: (message: string, meal: MealSlot) => void;
  /** `ingredient`: mängden och enheterna den räknades med. */
  onAdd?: (value: UnitAmount, units: FoodUnit[]) => void;
  /** Visar "Ta bort posten" längst ner (vid redigering). */
  onDelete?: () => void;
  onCancel: () => void;
  /** Fiberdata (Livsmedelsverket, egna, OFF, måltider), `null` medan den laddas. */
  fiberSource?: FiberSource | null;
  /**
   * Näringsvärdena kompletterades ("Komplettera"): livsmedlet med de nya värdena. Utan den
   * visas bara näringsvärdenas status.
   */
  onFoodChange?: (food: FoodItem) => void;
  /** Tidigare loggposter fick de nya värdena (föräldern läser om matloggen). */
  onLogUpdated?: () => void;
}

interface UnitAmount {
  amount: number;
  unit: string;
  grams: number;
}

/**
 * Logga ett livsmedel i en enhet som passar det (dl, st, skiva …) eller gram,
 * kopplat till en måltid. En gissad styckvikt bekräftas med ett tryck.
 */
export function FoodLogForm({
  food,
  customUnits,
  purpose = 'log',
  last,
  editing,
  date,
  defaultMeal = null,
  favorite,
  onToggleFavorite,
  onUnitsChange,
  onSaved,
  onAdd,
  onDelete,
  onCancel,
  fiberSource = null,
  onFoodChange,
  onLogUpdated,
}: FoodLogFormProps) {
  const builtIn = builtInUnits(food);
  const base = baseOf(food);
  // Vid redigering gäller enheten som den vägde när posten loggades.
  const loggedUnit = editing ? entryUnit(editing) : null;
  const units = mergeUnits(builtIn, customUnits, loggedUnit ? [loggedUnit] : []);

  const [usage] = useState(() =>
    editing ? { unit: editing.unit, amount: editing.amount } : initialUsage(units, last),
  );
  const [unit, setUnit] = useState(usage.unit);
  const [amount, setAmount] = useState(() => decimalInput(usage.amount));
  const [meal, setMeal] = useState<MealSlot>(
    () => editing?.meal ?? defaultMeal ?? defaultMealSlot(new Date().getHours()),
  );
  const [adjusting, setAdjusting] = useState(false);
  const [adjustGrams, setAdjustGrams] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  /** Efter en komplettering: livsmedlet med nya värden (erbjud att uppdatera tidigare loggar). */
  const [offer, setOffer] = useState<FoodItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const parsed = parseUnitAmount(amount, unit, units);
  const preview = parsed.ok ? scaleNutrients(food.per100, parsed.value.grams) : null;
  // `undefined` medan fiberdatan laddas (då visas ingen fiber), `null` = saknas ("–").
  const fiberFor = (grams: number) =>
    fiberSource ? fiberForItem(food, grams, fiberSource) : undefined;
  // Detaljer: per 100 g och per livsmedlets första enhet med vikt (portion, skiva …).
  const portion = units[0];
  // Recept i portioner: ½, 1, 1½, 2. Övriga enheter som räknas i antal: ½, 1, 2.
  const recipePortions = food.source === 'recept' && unit === PORTION_UNIT;
  const quickAmounts = recipePortions ? RECIPE_PORTIONS : QUICK_AMOUNTS;
  const quick = recipePortions || QUICK_AMOUNT_UNITS.includes(unit);
  const selected = units.find((u) => u.name === unit);
  const guess = isGuess(selected) ? selected : undefined;

  function changeUnit(next: string) {
    if (next === unit) return;
    // Till gram: behåll mängden. Till en annan enhet: börja på 1.
    setAmount(isGram(next) ? decimalInput(parsed.ok ? parsed.value.grams : 100) : '1');
    setUnit(next);
    setError(null);
    setAdjusting(false);
  }

  /** Sparar den gissade enheten (eller den justerade vikten) som egen enhet. */
  async function confirm(guessed: FoodUnit, grams?: number) {
    await onUnitsChange(confirmGuess(customUnits, guessed, grams));
    setAdjusting(false);
  }

  async function saveAdjusted(guessed: FoodUnit) {
    const grams = parseDecimal(adjustGrams);
    if (grams == null || grams < 0.1 || grams > MAX_GRAMS) {
      setAdjustError(`Ange vikten i ${base === 'ml' ? 'ml' : 'gram'} (0,1–5 000).`);
      return;
    }
    setAdjustError(null);
    await confirm(guessed, grams);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseUnitAmount(amount, unit, units);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (purpose === 'ingredient') {
      onAdd?.(result.value, units);
      return;
    }
    const now = Date.now();
    const entry: FoodLogEntry = {
      id: editing?.id ?? newId(),
      date: editing?.date ?? date,
      meal,
      foodId: food.id,
      name: food.name,
      ...result.value,
      per100: food.per100,
      createdAt: editing?.createdAt ?? now,
    };
    if (editing) entry.updatedAt = now;
    if (food.per100Unit === 'ml') entry.per100Unit = 'ml';
    // Receptet som det ser ut nu (eller som posten loggades) följer med posten.
    if (food.recipe) entry.recipe = food.recipe;
    await putFoodLog(entry);
    onSaved(
      `${editing ? 'Uppdaterade' : 'Loggade'} ${food.name} (${loggedAmountText(entry)}) till ${mealLabel(meal).toLowerCase()}.`,
      meal,
    );
  }

  const unitLabel = isGram(unit) ? 'g' : unit;
  const showStatus = editing === null && hasNutritionStatus(food);

  if (completing) {
    return (
      <NutritionCompleteForm
        food={food}
        onSaved={(updated, portionG) => {
          setCompleting(false);
          setNotice('Sparade näringsvärdena.');
          setOffer(updated);
          const hasPortion = units.some((u) => u.name.toLowerCase() === 'portion');
          if (portionG !== null && !hasPortion) {
            void onUnitsChange([
              ...customUnits,
              { name: 'portion', grams: portionG, source: 'egen' },
            ]);
          }
          onFoodChange?.(updated);
        }}
        onCancel={() => {
          setCompleting(false);
        }}
      />
    );
  }

  return (
    <>
      {offer && (
        <LogUpdateOffer
          food={offer}
          onDone={(updated) => {
            setOffer(null);
            if (updated > 0) {
              setNotice(
                `Uppdaterade ${formatInt(updated)} ${updated === 1 ? 'loggpost' : 'loggposter'}.`,
              );
              onLogUpdated?.();
            }
          }}
        />
      )}
      <form
        className="card form"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        aria-labelledby="log-food-title"
        data-testid="food-log-form"
      >
        <div className="card-header">
          <h2 className="card-title" id="log-food-title">
            {editing ? 'Redigera' : purpose === 'ingredient' ? 'Lägg till' : 'Logga'}: {food.name}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-pressed={favorite}
            aria-label="Favorit"
            onClick={onToggleFavorite}
          >
            <span aria-hidden="true">{favorite ? '★' : '☆'}</span>
          </button>
        </div>
        <p className="form-note muted food-source">
          {SOURCE_LABELS[food.source]}
          <ClaimTags claims={claimsFor(food, fiberSource)} />
        </p>
        {notice && (
          <p className="form-ok" role="status" data-testid="nutrition-notice">
            {notice}
          </p>
        )}
        <ul className="list list-flush food-facts" data-testid="food-facts">
          <ListRow
            testId="food-per-100"
            primary={`Per 100 ${base}`}
            secondary={<Macros nutrients={food.per100} fiber={fiberFor(100)} />}
            value={<span className="kcal">{formatKcal(food.per100.kcal)}</span>}
          />
          {portion && (
            <ListRow
              testId="food-per-unit"
              primary={`Per ${portion.name}`}
              secondary={
                <Macros
                  lead={`≈ ${formatBase(portion.grams, base)}`}
                  nutrients={scaleNutrients(food.per100, portion.grams)}
                  fiber={fiberFor(portion.grams)}
                />
              }
              value={
                <span className="kcal">{formatKcal((food.per100.kcal * portion.grams) / 100)}</span>
              }
            />
          )}
        </ul>
        {showStatus && (
          <NutritionStatus
            food={food}
            {...(onFoodChange
              ? {
                  onComplete: () => {
                    setOffer(null);
                    setCompleting(true);
                  },
                }
              : {})}
          />
        )}
        <div className="field-row">
          <label className="field">
            <span className="field-label">Mängd ({unitLabel})</span>
            <input
              className="input"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
              }}
            />
          </label>
          {purpose === 'log' && (
            <label className="field">
              <span className="field-label">Måltid</span>
              <select
                className="input"
                value={meal}
                onChange={(e) => {
                  const slot = MEAL_SLOTS.find((m) => m.id === e.target.value);
                  if (slot) setMeal(slot.id);
                }}
              >
                {MEAL_SLOTS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="chip-grid" role="group" aria-label="Enhet">
          {[...units.map((u) => u.name), GRAM].map((name) => (
            <button
              key={name}
              type="button"
              className="chip"
              aria-pressed={name === unit}
              onClick={() => {
                changeUnit(name);
              }}
            >
              {name}
            </button>
          ))}
        </div>
        {guess && (
          <div
            className="guess-confirm"
            role="group"
            aria-label="Bekräfta enhet"
            data-testid="guess"
          >
            <p className="guess-question">{guessQuestion(guess, base)}</p>
            {adjusting ? (
              <>
                <label className="field">
                  <span className="field-label">
                    {base === 'ml' ? 'ml' : 'Gram'} per {guess.name}
                  </span>
                  <input
                    className="input"
                    inputMode="decimal"
                    autoComplete="off"
                    value={adjustGrams}
                    onChange={(e) => {
                      setAdjustGrams(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void saveAdjusted(guess);
                      }
                    }}
                  />
                </label>
                {adjustError && (
                  <p className="form-error" role="alert">
                    {adjustError}
                  </p>
                )}
                <div className="button-row">
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => void saveAdjusted(guess)}
                  >
                    Spara vikten
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => {
                      setAdjusting(false);
                    }}
                  >
                    Behåll gissningen
                  </button>
                </div>
              </>
            ) : (
              <div className="button-row">
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => void confirm(guess)}
                >
                  Ja, det stämmer
                </button>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => {
                    setAdjustGrams(decimalInput(guess.grams));
                    setAdjustError(null);
                    setAdjusting(true);
                  }}
                >
                  Justera
                </button>
              </div>
            )}
          </div>
        )}
        {quick && (
          <div className="chip-grid" role="group" aria-label="Snabbval mängd">
            {quickAmounts.map((q) => (
              <button
                key={q.value}
                type="button"
                className="chip"
                aria-label={`${q.label} ${unit}`}
                aria-pressed={parsed.ok && parsed.value.amount === q.value}
                onClick={() => {
                  setAmount(decimalInput(q.value));
                  setError(null);
                }}
              >
                {q.label}
              </button>
            ))}
          </div>
        )}
        <div aria-live="polite">
          <p className="log-preview" data-testid="log-preview">
            {preview && parsed.ok
              ? isGram(unit)
                ? `${formatGrams(parsed.value.grams)} · ${formatKcal(preview.kcal)}`
                : `${amountLabel(parsed.value.amount, unit)} ≈ ${formatBase(parsed.value.grams, base)} · ${formatKcal(preview.kcal)}`
              : 'Ange en mängd.'}
          </p>
          {preview && parsed.ok && (
            <p className="log-macros" data-testid="log-macros">
              <Macros nutrients={preview} fiber={fiberFor(parsed.value.grams)} />
            </p>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="button">
            {editing ? 'Spara ändringar' : purpose === 'ingredient' ? 'Lägg till' : 'Logga'}
          </button>
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Avbryt
          </button>
        </div>
        <details className="plan-details" data-testid="food-units">
          <summary>Enheter för {food.name}</summary>
          <UnitList
            builtIn={builtIn}
            base={base}
            canAdd
            custom={customUnits}
            onChange={async (next) => {
              const added = next.find(
                (u) => !customUnits.some((c) => c.name.toLowerCase() === u.name.toLowerCase()),
              );
              await onUnitsChange(next);
              // Ny egen enhet: välj den direkt.
              if (added) {
                changeUnit(added.name);
                return;
              }
              // Borttagen enhet: byt till gram med samma mängd.
              if (gramsPerUnit(mergeUnits(builtIn, next), unit) === null && !isGram(unit)) {
                changeUnit(GRAM);
              }
            }}
          />
        </details>
        {onDelete && (
          <button
            type="button"
            className="button button-ghost button-small button-danger-text"
            onClick={onDelete}
          >
            Ta bort posten
          </button>
        )}
      </form>
    </>
  );
}
