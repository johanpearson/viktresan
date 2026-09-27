import { useState, type SyntheticEvent } from 'react';
import { newId, putMeal, type FoodLogEntry, type SavedMeal } from '../db/db.ts';
import { entriesToMealItems } from '../lib/foodDay.ts';

/** Samma gräns som i MealBuilder. */
const NAME_MAX = 60;

interface SaveMealFormProps {
  /** Förifyllt namn, t.ex. "Frukost 26 sep". */
  defaultName: string;
  entries: readonly FoodLogEntry[];
  /** Sparade måltider – loggade måltider i posterna delas upp i sina ingredienser. */
  meals: readonly SavedMeal[];
  onSaved: (meal: SavedMeal) => void;
  onCancel: () => void;
}

/** "Spara som egen måltid": namn, och alla poster med mängd och enhet blir ingredienser. */
export function SaveMealForm({
  defaultName,
  entries,
  meals,
  onSaved,
  onCancel,
}: SaveMealFormProps) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const items = entriesToMealItems(entries, meals);

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Ge måltiden ett namn.');
      return;
    }
    const meal: SavedMeal = { id: newId(), name: trimmed, items, createdAt: Date.now() };
    await putMeal(meal);
    onSaved(meal);
  }

  return (
    <form className="form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <label className="field">
        <span className="field-label">Namn</span>
        <input
          className="input"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby={error ? 'save-meal-error' : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </label>
      {error && (
        <p className="form-error" id="save-meal-error" role="alert">
          {error}
        </p>
      )}
      <p className="form-note muted">
        {items.length === 1 ? '1 ingrediens' : `${String(items.length)} ingredienser`} med mängd och
        enhet sparas som en egen måltid under Måltider.
      </p>
      <div className="button-row">
        <button type="submit" className="button">
          Spara måltid
        </button>
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </form>
  );
}
