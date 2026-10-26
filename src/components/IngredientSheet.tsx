import { useState, type SyntheticEvent } from 'react';
import { decimalInput, formatKcal } from '../lib/format.ts';
import { rowAmount, withPick, type EditorRow } from '../lib/recipeEditor.ts';
import { GRAM, baseOf, convertAmount, formatBase, isGram, type Usage } from '../lib/units.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { FoodPicker, type FoodSource } from './FoodPicker.tsx';
import { ListRow } from './ListRow.tsx';

interface IngredientSheetProps {
  row: EditorRow;
  source: FoodSource;
  onSave: (row: EditorRow) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Förvald mängd i sök-sheeten: radens mängd om den går att läsa. */
function usageOf(row: EditorRow): Usage | null {
  const parsed = rowAmount(row);
  if (parsed?.ok) return { unit: parsed.value.unit, amount: parsed.value.amount };
  return row.suggested;
}

/**
 * En ingrediens i receptets redigeringsvy: originaltexten (skrivskyddad), vald matchning
 * (byts i sök-sheeten med skanner), mängd och enhet samt om raden räknas in i receptet.
 * Klar för tillbaka raden; "Ta bort ingrediensen" tar bort den (med Ångra i vyn).
 */
export function IngredientSheet({ row, source, onSave, onRemove, onClose }: IngredientSheetProps) {
  const [draft, setDraft] = useState<EditorRow>(row);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = rowAmount(draft);
  const { food } = draft;
  const name = food?.name ?? draft.original ?? 'ingrediensen';

  function update(change: Partial<EditorRow>) {
    setError(null);
    setDraft((prev) => ({ ...prev, ...change }));
  }

  function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (draft.counted && food === null) {
      setError('Välj ett livsmedel – eller stäng av Räkna in i receptet.');
      return;
    }
    if (draft.counted && parsed && !parsed.ok) {
      setError(parsed.error);
      return;
    }
    const changed =
      draft.food?.id !== row.food?.id || draft.amount !== row.amount || draft.unit !== row.unit;
    onSave(
      changed && draft.confidence !== null && draft.counted
        ? { ...draft, confidence: 'hog' }
        : draft,
    );
  }

  return (
    <BottomSheet title="Ingrediens" onClose={onClose}>
      <form
        className="form"
        onSubmit={handleSubmit}
        noValidate
        data-testid="ingredient-sheet"
        aria-label={`Ingrediens ${name}`}
      >
        {draft.original !== undefined && (
          <div className="field">
            <span className="field-label" id="ingredient-original-label">
              I receptet
            </span>
            <p
              className="ingredient-original"
              aria-labelledby="ingredient-original-label"
              data-testid="ingredient-original"
            >
              {draft.original}
            </p>
          </div>
        )}
        <ul className="list list-flush">
          <ListRow
            testId="ingredient-food"
            primary={food ? food.name : 'Välj livsmedel'}
            secondary={
              food
                ? `Matchning · ${formatKcal(food.per100.kcal)} per 100 ${baseOf(food)}`
                : 'Ingen träff ännu – sök eller skanna'
            }
            chevron
            onClick={() => {
              setPicking(true);
            }}
          />
        </ul>
        {food && (
          <div className="field-row">
            <label className="field">
              <span className="field-label">Mängd</span>
              <input
                className="input"
                inputMode="decimal"
                autoComplete="off"
                value={draft.amount}
                onChange={(e) => {
                  update({ amount: e.target.value });
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Enhet</span>
              <select
                className="input"
                value={draft.unit}
                onChange={(e) => {
                  const next = e.target.value;
                  const grams = parsed?.ok ? parsed.value.grams : null;
                  // Samma vikt i den nya enheten (köksvänligt avrundad), annars 1.
                  const amount =
                    grams === null
                      ? isGram(next)
                        ? 100
                        : 1
                      : (convertAmount(grams, next, draft.units) ?? 1);
                  update({ unit: next, amount: decimalInput(amount) });
                }}
              >
                {[...draft.units.map((u) => u.name), GRAM].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {food && (
          <p className="form-note" data-testid="ingredient-preview">
            {parsed?.ok
              ? `≈ ${formatBase(parsed.value.grams, baseOf(food))} · ${formatKcal((food.per100.kcal * parsed.value.grams) / 100)}`
              : parsed?.error}
          </p>
        )}
        <label className="switch-row" data-testid="ingredient-counted">
          <span className="switch-text">
            <span className="switch-label">Räkna in i receptet</span>
            <span className="switch-description" id="ingredient-counted-desc">
              Av för t.ex. salt efter smak eller vatten – raden räknas inte i näringen och sparas
              inte i receptet.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={draft.counted}
            aria-describedby="ingredient-counted-desc"
            onChange={(e) => {
              update({ counted: e.target.checked });
            }}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="button">
            Klar
          </button>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Avbryt
          </button>
        </div>
        <button
          type="button"
          className="button button-ghost button-small button-danger-text"
          onClick={onRemove}
        >
          Ta bort ingrediensen
        </button>
      </form>
      {/* Utanför formuläret: sök-sheeten har egna formulär. */}
      {picking && (
        <FoodPicker
          source={source}
          title="Välj livsmedel"
          initialQuery={draft.query}
          initialUsage={usageOf(draft)}
          mode={{
            kind: 'ingredient',
            onAdd: (picked, value, units) => {
              setError(null);
              setDraft((prev) => withPick(prev, picked, value, units));
              setPicking(false);
            },
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
    </BottomSheet>
  );
}
