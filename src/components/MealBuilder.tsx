import { useState, type SyntheticEvent } from 'react';
import { newId, putMeal, type MealIngredient, type SavedMeal } from '../db/db.ts';
import type { FoodItem } from '../lib/foodSearch.ts';
import { decimalInput, formatGrams, formatKcal, parseDecimal } from '../lib/format.ts';
import { totalOf } from '../lib/nutrition.ts';
import { FoodSearch } from './FoodSearch.tsx';

interface MealBuilderProps {
  /** Måltiden som redigeras, annars skapas en ny. */
  meal: SavedMeal | null;
  searchItems: readonly FoodItem[];
  loading: boolean;
  onSaved: (meal: SavedMeal) => void;
  onCancel: () => void;
}

interface Row {
  key: string;
  foodId: string;
  name: string;
  per100: MealIngredient['per100'];
  grams: string;
}

function rowsFor(meal: SavedMeal | null): Row[] {
  return (meal?.items ?? []).map((item) => ({
    key: newId(),
    foodId: item.foodId,
    name: item.name,
    per100: item.per100,
    grams: decimalInput(item.grams),
  }));
}

/** Sparad måltid: flera ingredienser med gram. */
export function MealBuilder({ meal, searchItems, loading, onSaved, onCancel }: MealBuilderProps) {
  const [name, setName] = useState(meal?.name ?? '');
  const [rows, setRows] = useState<Row[]>(() => rowsFor(meal));
  const [error, setError] = useState<string | null>(null);

  const valid = rows.map((r) => ({ row: r, grams: parseDecimal(r.grams) }));
  const totals = totalOf(
    valid.flatMap(({ row, grams }) =>
      grams != null && grams > 0 ? [{ grams, per100: row.per100 }] : [],
    ),
  );
  const totalG = valid.reduce((s, v) => s + (v.grams != null && v.grams > 0 ? v.grams : 0), 0);

  function addIngredient(item: FoodItem) {
    setRows((prev) => [
      ...prev,
      {
        key: newId(),
        foodId: item.id,
        name: item.name,
        per100: item.per100,
        grams: decimalInput(item.portionG ?? 100),
      },
    ]);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 120) {
      setError('Ge måltiden ett namn.');
      return;
    }
    if (rows.length === 0) {
      setError('Lägg till minst en ingrediens.');
      return;
    }
    const items: MealIngredient[] = [];
    for (const row of rows) {
      const grams = parseDecimal(row.grams);
      if (grams == null || grams <= 0 || grams > 5000) {
        setError(`Ange gram för ${row.name} (1–5 000).`);
        return;
      }
      items.push({ foodId: row.foodId, name: row.name, grams, per100: row.per100 });
    }
    const now = Date.now();
    const saved: SavedMeal = {
      id: meal?.id ?? newId(),
      name: trimmed,
      items,
      createdAt: meal?.createdAt ?? now,
    };
    if (meal) saved.updatedAt = now;
    await putMeal(saved);
    onSaved(saved);
  }

  return (
    <form
      className="card form"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
      aria-labelledby="meal-builder-title"
    >
      <h2 className="card-title" id="meal-builder-title">
        {meal ? 'Redigera måltid' : 'Ny måltid'}
      </h2>
      <label className="field">
        <span className="field-label">Måltidens namn</span>
        <input
          className="input"
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </label>
      {rows.length > 0 && (
        <ul className="ingredient-list" aria-label="Ingredienser">
          {rows.map((row) => (
            <li key={row.key} className="ingredient" data-testid="ingredient">
              <span className="ingredient-name">{row.name}</span>
              <label className="ingredient-grams">
                <span className="visually-hidden">Gram {row.name}</span>
                <input
                  className="input"
                  inputMode="decimal"
                  autoComplete="off"
                  value={row.grams}
                  onChange={(e) => {
                    const grams = e.target.value;
                    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, grams } : r)));
                  }}
                />
                <span aria-hidden="true">g</span>
              </label>
              <button
                type="button"
                className="button button-danger button-small"
                aria-label={`Ta bort ingrediensen ${row.name}`}
                onClick={() => {
                  setRows((prev) => prev.filter((r) => r.key !== row.key));
                }}
              >
                Ta bort
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="form-note" data-testid="meal-total">
        {rows.length === 0
          ? 'Inga ingredienser ännu.'
          : `Totalt ${formatGrams(totalG)} · ${formatKcal(totals.kcal)}`}
      </p>
      <FoodSearch
        items={searchItems}
        onPick={addIngredient}
        label="Lägg till ingrediens"
        loading={loading}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
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
