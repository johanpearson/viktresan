import { useState, type SyntheticEvent } from 'react';
import { newId, putMeal, type SavedMeal } from '../db/db.ts';
import { scaleFiber } from '../lib/fiber.ts';
import { formatGrams, formatKcal } from '../lib/format.ts';
import { scaleNutrients } from '../lib/nutrition.ts';
import { useIngredients } from '../lib/useIngredients.ts';
import { FoodPicker, type FoodSource } from './FoodPicker.tsx';
import { IngredientEditor } from './IngredientEditor.tsx';
import { ListRow } from './ListRow.tsx';
import { Macros } from './Macros.tsx';

interface MealBuilderProps {
  /** Måltiden som redigeras, annars skapas en ny. */
  meal: SavedMeal | null;
  /** Livsmedel och egna enheter; ingredienser läggs till med sök-sheeten. */
  source: FoodSource;
  onSaved: (meal: SavedMeal) => void;
  onCancel: () => void;
  /** Visar "Ta bort måltiden" längst ner (bara vid redigering). */
  onDelete?: () => void;
}

/** Sparad måltid: flera ingredienser, var och en i gram eller en enhet. */
export function MealBuilder({ meal, source, onSaved, onCancel, onDelete }: MealBuilderProps) {
  const ingredients = useIngredients(meal?.items ?? [], source.foodData, source.livsmedel);
  const [name, setName] = useState(meal?.name ?? '');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 120) {
      setError('Ge måltiden ett namn.');
      return;
    }
    if (ingredients.rows.length === 0) {
      setError('Lägg till minst en ingrediens.');
      return;
    }
    const result = ingredients.toItems();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const now = Date.now();
    const saved: SavedMeal = {
      id: meal?.id ?? newId(),
      name: trimmed,
      items: result.items,
      createdAt: meal?.createdAt ?? now,
    };
    if (meal?.ean) saved.ean = meal.ean;
    if (meal) saved.updatedAt = now;
    await putMeal(saved);
    onSaved(saved);
  }

  return (
    <>
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
        <IngredientEditor
          ingredients={ingredients}
          onAddClick={() => {
            setPicking(true);
          }}
          summary={`Totalt ${formatGrams(ingredients.totalG)} · ${formatKcal(ingredients.totals.kcal)}`}
        />
        {ingredients.totalG > 0 && (
          <ul className="list list-flush" data-testid="meal-nutrition">
            <ListRow
              testId="meal-per-portion"
              primary="Per portion"
              secondary={
                <Macros
                  lead={`Hela måltiden, ${formatGrams(Math.round(ingredients.totalG))}`}
                  nutrients={ingredients.totals}
                  fiber={ingredients.fiber}
                />
              }
              value={<span className="kcal">{formatKcal(ingredients.totals.kcal)}</span>}
            />
            <ListRow
              testId="meal-per-100"
              primary="Per 100 g"
              secondary={
                <Macros
                  nutrients={scaleNutrients(ingredients.totals, 10_000 / ingredients.totalG)}
                  fiber={scaleFiber(ingredients.fiber, 100 / ingredients.totalG)}
                />
              }
              value={
                <span className="kcal">
                  {formatKcal((ingredients.totals.kcal * 100) / ingredients.totalG)}
                </span>
              }
            />
          </ul>
        )}
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
        {onDelete && (
          <button
            type="button"
            className="button button-ghost button-small button-danger-text"
            onClick={onDelete}
          >
            Ta bort måltiden
          </button>
        )}
      </form>
      {picking && (
        <FoodPicker
          source={source}
          focusSearch
          mode={{
            kind: 'ingredient',
            onAdd: (item, value, units) => {
              ingredients.add(item, value, units);
              setPicking(false);
            },
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
    </>
  );
}
