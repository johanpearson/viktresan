import { useState, type SyntheticEvent } from 'react';
import { newId, putFoodLog, type FoodLogEntry } from '../db/db.ts';
import { decimalInput, formatKcal } from '../lib/format.ts';
import { MEAL_SLOTS, defaultMealSlot, mealLabel, type MealSlot } from '../lib/nutrition.ts';
import { parseQuick, quickEntry, quickFoodId, type QuickValues } from '../lib/quickLog.ts';

interface QuickLogFormProps {
  /** Förifyllda värden (snabbval under Senaste/Favoriter), annars tomt. */
  initial: QuickValues | null;
  /** Posten som redigeras, annars loggas en ny. */
  editing: FoodLogEntry | null;
  date: string;
  /** Förvald måltid för nya poster, annars efter klockslaget. */
  defaultMeal?: MealSlot | null;
  favoriteIds: ReadonlySet<string>;
  /** Växlar favorit för snabbloggen med de ifyllda värdena. */
  onToggleFavorite: (foodId: string) => void;
  onSaved: (message: string, meal: MealSlot) => void;
  /** Visar "Ta bort posten" längst ner (vid redigering). */
  onDelete?: () => void;
  onCancel: () => void;
}

/**
 * Snabblogg: namn (valfritt), ungefärliga kcal, protein (valfritt) och måltid. Posten
 * räknas i alla summor men märks "uppskattat" och ingår inte i vitaminer och mineraler.
 */
export function QuickLogForm({
  initial,
  editing,
  date,
  defaultMeal = null,
  favoriteIds,
  onToggleFavorite,
  onSaved,
  onDelete,
  onCancel,
}: QuickLogFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kcal, setKcal] = useState(initial ? String(initial.kcal) : '');
  const [protein, setProtein] = useState(
    initial?.proteinG != null ? decimalInput(initial.proteinG) : '',
  );
  const [meal, setMeal] = useState<MealSlot>(
    () => editing?.meal ?? defaultMeal ?? defaultMealSlot(new Date().getHours()),
  );
  const [error, setError] = useState<string | null>(null);

  const parsed = parseQuick({ name, kcal, protein });
  const foodId = parsed.ok ? quickFoodId(parsed.value) : null;
  const favorite = foodId !== null && favoriteIds.has(foodId);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseQuick({ name, kcal, protein });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const entry = quickEntry(result.value, {
      id: newId(),
      date,
      meal,
      now: Date.now(),
      editing,
    });
    await putFoodLog(entry);
    onSaved(
      `${editing ? 'Uppdaterade' : 'Loggade'} ${entry.name} (≈ ${formatKcal(result.value.kcal)}) till ${mealLabel(meal).toLowerCase()}.`,
      meal,
    );
  }

  return (
    <form
      className="card form"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
      aria-labelledby="quick-log-title"
      data-testid="quick-log-form"
    >
      <div className="card-header">
        <h2 className="card-title" id="quick-log-title">
          {editing ? 'Redigera snabblogg' : 'Snabblogg'}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-pressed={favorite}
          aria-label="Favorit"
          disabled={foodId === null}
          onClick={() => {
            if (foodId !== null) onToggleFavorite(foodId);
          }}
        >
          <span aria-hidden="true">{favorite ? '★' : '☆'}</span>
        </button>
      </div>
      <p className="form-note muted">
        När du inte kan väga – t.ex. på restaurang. Räknas i dagens kalorier men märks som
        uppskattat.
      </p>
      <label className="field">
        <span className="field-label">Namn (valfritt)</span>
        <input
          className="input"
          autoComplete="off"
          placeholder="T.ex. Restaurang"
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Kcal</span>
          <input
            className="input"
            inputMode="numeric"
            autoComplete="off"
            required
            value={kcal}
            onChange={(e) => {
              setKcal(e.target.value);
              setError(null);
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Protein, g (valfritt)</span>
          <input
            className="input"
            inputMode="decimal"
            autoComplete="off"
            value={protein}
            onChange={(e) => {
              setProtein(e.target.value);
              setError(null);
            }}
          />
        </label>
      </div>
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
  );
}
