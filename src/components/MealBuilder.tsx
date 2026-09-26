import { useMemo, useState, type SyntheticEvent } from 'react';
import { newId, putMeal, type MealIngredient, type SavedMeal } from '../db/db.ts';
import { entryUnit, sourceOf } from '../lib/foodCatalog.ts';
import type { FoodItem } from '../lib/foodSearch.ts';
import { decimalInput, formatGrams, formatKcal } from '../lib/format.ts';
import { totalOf } from '../lib/nutrition.ts';
import {
  GRAM,
  baseOf,
  formatBase,
  initialUsage,
  isGram,
  mergeUnits,
  parseUnitAmount,
  unitsFor,
  type FoodUnit,
} from '../lib/units.ts';
import { FoodSearch } from './FoodSearch.tsx';

interface MealBuilderProps {
  /** Måltiden som redigeras, annars skapas en ny. */
  meal: SavedMeal | null;
  searchItems: readonly FoodItem[];
  /** Användarens egna enheter per livsmedel. */
  customUnits: ReadonlyMap<string, readonly FoodUnit[]>;
  loading: boolean;
  onSaved: (meal: SavedMeal) => void;
  onCancel: () => void;
}

interface Row {
  key: string;
  foodId: string;
  name: string;
  per100: MealIngredient['per100'];
  units: FoodUnit[];
  amount: string;
  unit: string;
  per100Unit?: 'ml';
}

/** Sparad måltid: flera ingredienser, var och en i gram eller en enhet. */
export function MealBuilder({
  meal,
  searchItems,
  customUnits,
  loading,
  onSaved,
  onCancel,
}: MealBuilderProps) {
  const catalog = useMemo(() => new Map(searchItems.map((i) => [i.id, i])), [searchItems]);
  const [name, setName] = useState(meal?.name ?? '');
  const [rows, setRows] = useState<Row[]>(() =>
    (meal?.items ?? []).map((item) => {
      const food = catalog.get(item.foodId) ?? {
        id: item.foodId,
        name: item.name,
        source: sourceOf(item.foodId),
      };
      // Ingrediensens enhet som den vägde när måltiden sparades.
      const logged = entryUnit(item);
      const row: Row = {
        key: newId(),
        foodId: item.foodId,
        name: item.name,
        per100: item.per100,
        units: mergeUnits(unitsFor(food, customUnits.get(item.foodId)), logged ? [logged] : []),
        amount: decimalInput(item.amount),
        unit: item.unit,
      };
      if (item.per100Unit) row.per100Unit = item.per100Unit;
      return row;
    }),
  );
  const [error, setError] = useState<string | null>(null);

  const parsedRows = rows.map((row) => ({
    row,
    parsed: parseUnitAmount(row.amount, row.unit, row.units),
  }));
  const valid = parsedRows.flatMap(({ row, parsed }) =>
    parsed.ok ? [{ grams: parsed.value.grams, per100: row.per100 }] : [],
  );
  const totals = totalOf(valid);
  const totalG = valid.reduce((s, v) => s + v.grams, 0);

  function updateRow(key: string, change: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  function addIngredient(item: FoodItem) {
    const units = unitsFor(item, customUnits.get(item.id));
    const usage = initialUsage(units, null);
    const row: Row = {
      key: newId(),
      foodId: item.id,
      name: item.name,
      per100: item.per100,
      units,
      amount: decimalInput(usage.amount),
      unit: usage.unit,
    };
    if (item.per100Unit === 'ml') row.per100Unit = 'ml';
    setRows((prev) => [...prev, row]);
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
      const parsed = parseUnitAmount(row.amount, row.unit, row.units);
      if (!parsed.ok) {
        setError(`${row.name}: ${parsed.error}`);
        return;
      }
      const ingredient: MealIngredient = {
        foodId: row.foodId,
        name: row.name,
        ...parsed.value,
        per100: row.per100,
      };
      if (row.per100Unit) ingredient.per100Unit = row.per100Unit;
      items.push(ingredient);
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
                      updateRow(row.key, { amount: e.target.value });
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
                      updateRow(row.key, {
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
                  setRows((prev) => prev.filter((r) => r.key !== row.key));
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
