import { useState, type SyntheticEvent } from 'react';
import { newId, putFoodLog, type FoodLogEntry } from '../db/db.ts';
import { entryUnit } from '../lib/foodCatalog.ts';
import { SOURCE_LABELS, type FoodItem } from '../lib/foodSearch.ts';
import { decimalInput, formatGrams, formatKcal } from '../lib/format.ts';
import {
  MEAL_SLOTS,
  defaultMealSlot,
  mealLabel,
  scaleNutrients,
  type MealSlot,
} from '../lib/nutrition.ts';
import {
  GRAM,
  QUICK_AMOUNTS,
  QUICK_AMOUNT_UNITS,
  amountLabel,
  gramsPerUnit,
  initialUsage,
  isGram,
  loggedAmountText,
  mergeUnits,
  parseUnitAmount,
  standardUnitsFor,
  type FoodUnit,
  type Usage,
} from '../lib/units.ts';
import { UnitForm } from './UnitForm.tsx';
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

/** Logga ett livsmedel i gram eller en enhet (st, skiva, dl …), kopplat till en måltid. */
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
  const builtIn = mergeUnits(food.units, standardUnitsFor(food));
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
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseUnitAmount(amount, unit, units);
  const preview = parsed.ok ? scaleNutrients(food.per100, parsed.value.grams) : null;
  const quick = QUICK_AMOUNT_UNITS.includes(unit);

  function changeUnit(next: string) {
    if (next === unit) return;
    // Till gram: behåll mängden. Till en annan enhet: börja på 1.
    setAmount(isGram(next) ? decimalInput(parsed.ok ? parsed.value.grams : 100) : '1');
    setUnit(next);
    setError(null);
  }

  async function addUnit(added: FoodUnit) {
    await onUnitsChange([...customUnits, added]);
    setAdding(false);
    setUnit(added.name);
    setAmount('1');
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
        {SOURCE_LABELS[food.source]} · {formatKcal(food.per100.kcal)} per 100 g
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
        {[GRAM, ...units.map((u) => u.name)].map((name) => (
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
        {!adding && (
          <button
            type="button"
            className="chip chip-add"
            onClick={() => {
              setAdding(true);
            }}
          >
            + Lägg till enhet
          </button>
        )}
      </div>
      {adding && (
        <UnitForm
          unit={null}
          others={customUnits}
          onSave={addUnit}
          onCancel={() => {
            setAdding(false);
          }}
        />
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
            : `${amountLabel(parsed.value.amount, unit)} ≈ ${formatGrams(parsed.value.grams)} · ${formatKcal(preview.kcal)}`
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
          custom={customUnits}
          onChange={async (next) => {
            await onUnitsChange(next);
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
