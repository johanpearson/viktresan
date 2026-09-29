import { useState, type SyntheticEvent } from 'react';
import { newId, putRecipe, type Recipe } from '../db/db.ts';
import { scaleFiber } from '../lib/fiber.ts';
import { decimalInput, formatGrams, formatKcal, parseDecimal } from '../lib/format.ts';
import {
  COOKED_WEIGHT_MAX_G,
  SERVINGS_MAX,
  duplicateRecipe,
  recipeToSave,
  recipeYield,
} from '../lib/recipes.ts';
import { useIngredients } from '../lib/useIngredients.ts';
import { FoodPicker, type FoodSource } from './FoodPicker.tsx';
import { IngredientEditor } from './IngredientEditor.tsx';
import { ListRow } from './ListRow.tsx';
import { Macros } from './Macros.tsx';

interface RecipeBuilderProps {
  /** Receptet som redigeras, annars skapas ett nytt. */
  recipe: Recipe | null;
  /** Livsmedel och egna enheter; ingredienser läggs till med sök-sheeten. */
  source: FoodSource;
  onSaved: (recipe: Recipe) => void;
  /** "Duplicera recept": kopian är sparad och öppnas för redigering. */
  onDuplicated?: (copy: Recipe) => void;
  onCancel: () => void;
  /** Visar "Ta bort receptet" längst ner (bara vid redigering). */
  onDelete?: () => void;
}

/** Tolkar ett valfritt tal i ett intervall: `null` = tomt, `undefined` = ogiltigt. */
function optionalNumber(text: string, min: number, max: number): number | null | undefined {
  if (text.trim() === '') return null;
  const value = parseDecimal(text);
  return value != null && value >= min && value <= max ? value : undefined;
}

/**
 * Recept: ingredienser (sök-sheeten med skanner och enheter) och utbyte som antal
 * portioner och/eller tillagad vikt. Visar näring per portion och per 100 g. En
 * ändring påverkar bara nya loggar – loggade portioner har kvar sina värden.
 */
export function RecipeBuilder({
  recipe,
  source,
  onSaved,
  onDuplicated,
  onCancel,
  onDelete,
}: RecipeBuilderProps) {
  const ingredients = useIngredients(recipe?.items ?? [], source.foodData, source.livsmedel);
  const [name, setName] = useState(recipe?.name ?? '');
  const [servings, setServings] = useState(
    recipe?.servings !== undefined ? decimalInput(recipe.servings) : '',
  );
  const [cooked, setCooked] = useState(
    recipe?.cookedWeightG !== undefined ? decimalInput(recipe.cookedWeightG) : '',
  );
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const servingsValue = optionalNumber(servings, 0.5, SERVINGS_MAX);
  const cookedValue = optionalNumber(cooked, 1, COOKED_WEIGHT_MAX_G);
  const y = recipeYield({
    items: ingredients.valid,
    servings: servingsValue ?? undefined,
    cookedWeightG: cookedValue ?? undefined,
  });
  const hasYield = servingsValue != null || cookedValue != null;

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 120) {
      setError('Ge receptet ett namn.');
      return;
    }
    if (ingredients.rows.length === 0) {
      setError('Lägg till minst en ingrediens.');
      return;
    }
    if (servingsValue === undefined) {
      setError(`Ange antal portioner (0,5–${String(SERVINGS_MAX)}) eller lämna tomt.`);
      return;
    }
    if (cookedValue === undefined) {
      setError('Ange tillagad vikt i gram (1–20 000) eller lämna tomt.');
      return;
    }
    if (servingsValue === null && cookedValue === null) {
      setError('Ange antal portioner, tillagad vikt eller båda.');
      return;
    }
    const result = ingredients.toItems();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const saved = recipeToSave(recipe, {
      id: newId(),
      name: trimmed,
      items: result.items,
      servings: servingsValue,
      cookedWeightG: cookedValue,
    });
    await putRecipe(saved);
    onSaved(saved);
  }

  async function duplicate() {
    if (!recipe) return;
    const copy = duplicateRecipe(recipe, newId());
    await putRecipe(copy);
    onDuplicated?.(copy);
  }

  return (
    <>
      <form
        className="card form"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        aria-labelledby="recipe-builder-title"
        data-testid="recipe-form"
      >
        <h2 className="card-title" id="recipe-builder-title">
          {recipe ? 'Redigera recept' : 'Nytt recept'}
        </h2>
        <label className="field">
          <span className="field-label">Receptets namn</span>
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
          summary={`Ingredienser ${formatGrams(Math.round(ingredients.totalG))} · ${formatKcal(ingredients.totals.kcal)}`}
        />
        <fieldset className="fieldset">
          <legend className="field-label">Utbyte</legend>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Antal portioner</span>
              <input
                className="input"
                inputMode="decimal"
                autoComplete="off"
                value={servings}
                onChange={(e) => {
                  setServings(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Tillagad vikt (g)</span>
              <input
                className="input"
                inputMode="decimal"
                autoComplete="off"
                value={cooked}
                onChange={(e) => {
                  setCooked(e.target.value);
                  setError(null);
                }}
              />
            </label>
          </div>
          <p className="form-note muted">
            Ange minst ett. Väg gärna grytan efter tillagning – då blir gram rätt när du loggar.
          </p>
        </fieldset>
        {hasYield && ingredients.valid.length > 0 && (
          <ul className="list list-flush" data-testid="recipe-nutrition">
            {y.perPortion && y.portionG !== null && (
              <ListRow
                testId="recipe-per-portion"
                primary="Per portion"
                secondary={
                  <Macros
                    lead={`≈ ${formatGrams(Math.round(y.portionG))}`}
                    nutrients={y.perPortion}
                    fiber={scaleFiber(ingredients.fiber, 1 / (y.servings ?? 1))}
                  />
                }
                value={<span className="kcal">{formatKcal(y.perPortion.kcal)}</span>}
              />
            )}
            <ListRow
              testId="recipe-per-100"
              primary="Per 100 g"
              secondary={
                <Macros
                  lead={y.cooked ? 'Tillagad vikt' : 'Ingrediensernas vikt'}
                  nutrients={y.per100}
                  fiber={y.yieldG > 0 ? scaleFiber(ingredients.fiber, 100 / y.yieldG) : null}
                />
              }
              value={<span className="kcal">{formatKcal(y.per100.kcal)}</span>}
            />
          </ul>
        )}
        {recipe && (
          <p className="form-note muted">
            Ändringar gäller nya loggar – det du redan loggat behåller sina värden.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="button">
            Spara recept
          </button>
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Avbryt
          </button>
        </div>
        {recipe && onDuplicated && (
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => void duplicate()}
          >
            Duplicera recept
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="button button-ghost button-small button-danger-text"
            onClick={onDelete}
          >
            Ta bort receptet
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
