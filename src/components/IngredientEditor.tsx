import { decimalInput, formatKcal } from '../lib/format.ts';
import { GRAM, baseOf, formatBase, isGram } from '../lib/units.ts';
import type { Ingredients } from '../lib/useIngredients.ts';

interface IngredientEditorProps {
  ingredients: Ingredients;
  /**
   * "Lägg till ingrediens": föräldern öppnar sök-sheeten (`FoodPicker` med
   * `kind: 'ingredient'`) – utanför sitt formulär, eftersom sheeten har egna formulär.
   */
  onAddClick: () => void;
  /** Summeringen under listan ("Totalt 1 200 g · 1 450 kcal"). */
  summary: string;
  summaryTestId?: string;
}

/**
 * Ingredienserna i en egen måltid eller ett recept: mängd och enhet per rad, summan
 * under och "Lägg till ingrediens", som öppnar sök-sheeten (sök, skanner, enheter).
 */
export function IngredientEditor({
  ingredients,
  onAddClick,
  summary,
  summaryTestId = 'meal-total',
}: IngredientEditorProps) {
  const { rows, parsedRows } = ingredients;

  return (
    <>
      {rows.length > 0 && (
        <ul className="ingredient-list" aria-label="Ingredienser">
          {parsedRows.map(({ row, parsed }) => (
            <li key={row.key} className="ingredient" data-testid="ingredient">
              <span className="ingredient-name">{row.name}</span>
              <div className="ingredient-amount">
                <label>
                  <span className="visually-hidden">Mängd {row.name}</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    autoComplete="off"
                    value={row.amount}
                    onChange={(e) => {
                      ingredients.update(row.key, { amount: e.target.value });
                    }}
                  />
                </label>
                <label>
                  <span className="visually-hidden">Enhet {row.name}</span>
                  <select
                    className="input"
                    value={row.unit}
                    onChange={(e) => {
                      const next = e.target.value;
                      ingredients.update(row.key, {
                        unit: next,
                        // Till gram: behåll vikten. Till en annan enhet: börja på 1.
                        amount: isGram(next)
                          ? decimalInput(parsed.ok ? parsed.value.grams : 100)
                          : '1',
                      });
                    }}
                  >
                    {[...row.units.map((u) => u.name), GRAM].map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="button button-danger button-small"
                aria-label={`Ta bort ingrediensen ${row.name}`}
                onClick={() => {
                  ingredients.remove(row.key);
                }}
              >
                Ta bort
              </button>
              <span className="ingredient-grams muted-inline" data-testid="ingredient-grams">
                {parsed.ok
                  ? isGram(row.unit)
                    ? formatKcal((row.per100.kcal * parsed.value.grams) / 100)
                    : `≈ ${formatBase(parsed.value.grams, baseOf(row))} · ${formatKcal((row.per100.kcal * parsed.value.grams) / 100)}`
                  : parsed.error}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="form-note" data-testid={summaryTestId}>
        {rows.length === 0 ? 'Inga ingredienser ännu.' : summary}
      </p>
      <button type="button" className="button button-secondary" onClick={onAddClick}>
        Lägg till ingrediens
      </button>
    </>
  );
}
