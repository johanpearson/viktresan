import { useState, type SyntheticEvent } from 'react';
import { newId, putFoodLog, type FoodLogEntry } from '../db/db.ts';
import { SOURCE_LABELS, type FoodItem } from '../lib/foodSearch.ts';
import { decimalInput, formatGrams, formatKcal } from '../lib/format.ts';
import {
  MEAL_SLOTS,
  defaultMealSlot,
  mealLabel,
  scaleNutrients,
  type MealSlot,
} from '../lib/nutrition.ts';
import { parseLogAmount } from '../lib/validation.ts';

interface FoodLogFormProps {
  food: FoodItem;
  /** Posten som redigeras, annars loggas en ny. */
  editing: FoodLogEntry | null;
  date: string;
  favorite: boolean;
  onToggleFavorite: () => void;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

type Unit = 'g' | 'portion';

function initialUnit(food: FoodItem, editing: FoodLogEntry | null): Unit {
  if (food.portionG == null) return 'g';
  if (editing) return editing.portionCount != null ? 'portion' : 'g';
  return 'portion';
}

function initialAmount(unit: Unit, editing: FoodLogEntry | null): string {
  if (editing) {
    return decimalInput(unit === 'portion' ? (editing.portionCount ?? 1) : editing.grams);
  }
  return unit === 'portion' ? '1' : '100';
}

/** Logga ett livsmedel med gram eller portioner, kopplat till en måltid. */
export function FoodLogForm({
  food,
  editing,
  date,
  favorite,
  onToggleFavorite,
  onSaved,
  onCancel,
}: FoodLogFormProps) {
  const [unit, setUnit] = useState<Unit>(() => initialUnit(food, editing));
  const [amount, setAmount] = useState(() => initialAmount(unit, editing));
  const [meal, setMeal] = useState<MealSlot>(
    () => editing?.meal ?? defaultMealSlot(new Date().getHours()),
  );
  const [error, setError] = useState<string | null>(null);

  const parsed = parseLogAmount(amount, unit, food.portionG);
  const preview = parsed.ok ? scaleNutrients(food.per100, parsed.value.grams) : null;
  const portionLabel = food.portionName ?? 'portion';

  function changeUnit(next: Unit) {
    if (next === unit) return;
    // Behåll mängden: räkna om mellan gram och portioner.
    if (parsed.ok && food.portionG) {
      setAmount(
        decimalInput(next === 'g' ? parsed.value.grams : parsed.value.grams / food.portionG),
      );
    } else {
      setAmount(next === 'g' ? '100' : '1');
    }
    setUnit(next);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseLogAmount(amount, unit, food.portionG);
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
      grams: result.value.grams,
      per100: food.per100,
      createdAt: editing?.createdAt ?? now,
    };
    if (editing) entry.updatedAt = now;
    if (result.value.portionCount != null) {
      entry.portionCount = result.value.portionCount;
      entry.portionName = portionLabel;
    }
    await putFoodLog(entry);
    onSaved(
      `${editing ? 'Uppdaterade' : 'Loggade'} ${food.name} (${formatGrams(entry.grams)}) till ${mealLabel(meal).toLowerCase()}.`,
    );
  }

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
        {food.portionG != null ? ` · 1 ${portionLabel} = ${formatGrams(food.portionG)}` : ''}
      </p>
      {food.portionG != null && (
        <div className="segmented segmented-2" role="group" aria-label="Enhet">
          <button
            type="button"
            className="segmented-button"
            aria-pressed={unit === 'portion'}
            onClick={() => {
              changeUnit('portion');
            }}
          >
            Portioner
          </button>
          <button
            type="button"
            className="segmented-button"
            aria-pressed={unit === 'g'}
            onClick={() => {
              changeUnit('g');
            }}
          >
            Gram
          </button>
        </div>
      )}
      <div className="field-row">
        <label className="field">
          <span className="field-label">{unit === 'g' ? 'Mängd (g)' : 'Antal portioner'}</span>
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
      <p className="form-note" data-testid="log-preview">
        {preview && parsed.ok
          ? `${formatGrams(parsed.value.grams)} ger ${formatKcal(preview.kcal)} · protein ${formatGrams(preview.proteinG)} · kolhydrater ${formatGrams(preview.carbsG)} · fett ${formatGrams(preview.fatG)}`
          : 'Ange en mängd.'}
      </p>
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
    </form>
  );
}
