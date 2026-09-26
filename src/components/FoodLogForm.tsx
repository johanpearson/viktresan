import { useState, type SyntheticEvent } from 'react';
import { newId, putFoodLog, type FoodLogEntry } from '../db/db.ts';
import { entryUnit } from '../lib/foodCatalog.ts';
import { SOURCE_LABELS, type FoodItem } from '../lib/foodSearch.ts';
import { decimalInput, formatGrams, formatKcal, parseDecimal } from '../lib/format.ts';
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
import { UnitList } from './UnitList.tsx';

interface FoodLogFormProps {
  food: FoodItem;
  /** Användarens egna enheter för livsmedlet. */
  customUnits: readonly FoodUnit[];
  /** Senast använda enhet och mängd (förifylls för nya poster). */
  last: Usage | null;
  /** Posten som redigeras, annars loggas en ny. */
  editing: FoodLogEntry | null;
  date: string;
  favorite: boolean;
  onToggleFavorite: () => void;
  /** Sparar livsmedlets egna enheter och laddar om. */
  onUnitsChange: (units: FoodUnit[]) => Promise<void>;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

/**
 * Logga ett livsmedel i en enhet som passar det (dl, st, skiva …) eller gram,
 * kopplat till en måltid. En gissad styckvikt bekräftas med ett tryck.
 */
export function FoodLogForm({
  food,
  customUnits,
  last,
  editing,
  date,
  favorite,
  onToggleFavorite,
  onUnitsChange,
  onSaved,
  onCancel,
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
    () => editing?.meal ?? defaultMealSlot(new Date().getHours()),
  );
  const [adjusting, setAdjusting] = useState(false);
  const [adjustGrams, setAdjustGrams] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseUnitAmount(amount, unit, units);
  const preview = parsed.ok ? scaleNutrients(food.per100, parsed.value.grams) : null;
  const quick = QUICK_AMOUNT_UNITS.includes(unit);
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
    await putFoodLog(entry);
    onSaved(
      `${editing ? 'Uppdaterade' : 'Loggade'} ${food.name} (${loggedAmountText(entry)}) till ${mealLabel(meal).toLowerCase()}.`,
    );
  }

  const unitLabel = isGram(unit) ? 'g' : unit;

  return (
    <form
      className="card form"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
      aria-labelledby="log-food-title"
      data-testid="food-log-form"
    >
      <div className="card-header">
        <h2 className="card-title" id="log-food-title">
          {editing ? 'Redigera' : 'Logga'}: {food.name}
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
      <p className="form-note muted">
        {SOURCE_LABELS[food.source]} · {formatKcal(food.per100.kcal)} per 100 {base}
      </p>
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
        <div className="guess-confirm" role="group" aria-label="Bekräfta enhet" data-testid="guess">
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
          {QUICK_AMOUNTS.map((q) => (
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
      <p className="log-preview" data-testid="log-preview" aria-live="polite">
        {preview && parsed.ok
          ? isGram(unit)
            ? `${formatGrams(parsed.value.grams)} · ${formatKcal(preview.kcal)}`
            : `${amountLabel(parsed.value.amount, unit)} ≈ ${formatBase(parsed.value.grams, base)} · ${formatKcal(preview.kcal)}`
          : 'Ange en mängd.'}
      </p>
      {preview && (
        <p className="form-note muted">
          Protein {formatGrams(preview.proteinG)} · kolhydrater {formatGrams(preview.carbsG)} · fett{' '}
          {formatGrams(preview.fatG)}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="button">
          {editing ? 'Spara ändringar' : 'Logga'}
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
    </form>
  );
}
