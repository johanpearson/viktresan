import { useState, type SyntheticEvent } from 'react';
import { putRecipe, type FoodLogEntry } from '../db/db.ts';
import { decimalInput, formatKcal, parseDecimal } from '../lib/format.ts';
import {
  SERVINGS_MAX,
  batchPortionsUsed,
  cookedAgoText,
  portionsText,
  recipeYield,
  type Leftover,
} from '../lib/recipes.ts';
import { leftoverRemovalText } from '../lib/removal.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { DetailSheet } from './DetailSheet.tsx';
import { ListRow } from './ListRow.tsx';

interface LeftoverDetailProps {
  leftover: Leftover;
  foodLog: readonly FoodLogEntry[];
  /** "Logga 1 portion": loggformuläret med en portion förvald. */
  onLog: () => void;
  /** Omgången är ändrad och sparad (läs om). */
  onSaved: (message: string) => Promise<void>;
  /** Ta bort matlådorna (efter bekräftelse) – med Ångra. */
  onRemove: () => void;
  onClose: () => void;
}

/**
 * Detaljvyn för matlådor (en lagad omgång av ett recept): kvar, när den lagades och kcal per
 * portion. "Logga 1 portion" är primär, Redigera ändrar antalet portioner kvar och "Ta bort
 * matlådorna" frågar först. Receptet och loggen påverkas aldrig.
 */
export function LeftoverDetail({
  leftover,
  foodLog,
  onLog,
  onSaved,
  onRemove,
  onClose,
}: LeftoverDetailProps) {
  const { recipe, left } = leftover;
  const [editing, setEditing] = useState(false);
  const [portions, setPortions] = useState(decimalInput(left));
  const [error, setError] = useState<string | null>(null);
  const perPortion = recipeYield(recipe).perPortion;
  const startedAt = recipe.batch?.startedAt ?? 0;

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const value = parseDecimal(portions);
    if (value == null || value < 0.5 || value > SERVINGS_MAX || (value * 2) % 1 !== 0) {
      setError(`Ange portioner kvar i halva portioner (0,5–${String(SERVINGS_MAX)}).`);
      return;
    }
    // Kvar räknas ur loggen: omgångens storlek = det som är kvar + det som redan ätits.
    const used = batchPortionsUsed(recipe, foodLog);
    await putRecipe({ ...recipe, batch: { startedAt, portions: value + used } });
    setEditing(false);
    await onSaved(`Matlådorna med ${recipe.name}: ${portionsText(value)} kvar.`);
  }

  return (
    <DetailSheet
      title={`Matlådor: ${recipe.name}`}
      testId="leftover-detail"
      onClose={onClose}
      primary={{ label: 'Logga 1 portion', onClick: onLog }}
      onEdit={() => {
        setPortions(decimalInput(left));
        setError(null);
        setEditing(true);
      }}
      remove={{
        label: 'Ta bort matlådorna',
        title: `Ta bort matlådorna med ${recipe.name}?`,
        consequence: leftoverRemovalText(left),
        onConfirm: onRemove,
      }}
      after={
        editing && (
          <BottomSheet
            title="Ändra matlådorna"
            onClose={() => {
              setEditing(false);
            }}
          >
            <form className="form" onSubmit={(e) => void handleSubmit(e)} noValidate>
              <label className="field">
                <span className="field-label">Portioner kvar</span>
                <input
                  className="input"
                  inputMode="decimal"
                  autoComplete="off"
                  value={portions}
                  onChange={(e) => {
                    setPortions(e.target.value);
                    setError(null);
                  }}
                />
              </label>
              <p className="form-note muted">
                Det du redan loggat ur omgången räknas inte om – bara det som är kvar ändras.
              </p>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="button-row">
                <button type="submit" className="button">
                  Spara
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setEditing(false);
                  }}
                >
                  Avbryt
                </button>
              </div>
            </form>
          </BottomSheet>
        )
      }
    >
      <ListRow primary="Kvar" value={portionsText(left)} />
      <ListRow primary="Lagad" value={cookedAgoText(startedAt).replace(/^lagad /, '')} />
      {perPortion && (
        <ListRow
          primary="Per portion"
          value={<span className="kcal">{formatKcal(perPortion.kcal)}</span>}
        />
      )}
    </DetailSheet>
  );
}
