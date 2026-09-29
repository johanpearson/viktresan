import { useState, type SyntheticEvent } from 'react';
import { newId, putFood, saveCustomUnits, type StoredFood } from '../db/db.ts';
import type { FoodLabel } from '../lib/aiLabel.ts';
import { decimalInput } from '../lib/format.ts';
import { builtInUnits, type FoodUnit } from '../lib/units.ts';
import { parseFoodFields, type FoodFields } from '../lib/validation.ts';
import { UnitList } from './UnitList.tsx';

interface CustomFoodFormProps {
  /** Livsmedlet som redigeras, annars skapas ett nytt. */
  food: StoredFood | null;
  /** Livsmedlets egna enheter (st, skiva …). */
  customUnits?: readonly FoodUnit[];
  /** Förifylld streckkod (efter en skanning utan träff). */
  ean?: string;
  /** Värden från AI-importen av etiketten – går att rätta innan sparning. */
  prefill?: FoodLabel | undefined;
  onSaved: (food: StoredFood) => void;
  onCancel: () => void;
  /** Visar "Ta bort livsmedlet" längst ner (bara vid redigering, Mat → Egna). */
  onDelete?: () => void;
}

function fieldsFor(
  food: StoredFood | null,
  ean: string | undefined,
  prefill: FoodLabel | undefined,
): FoodFields {
  const text = (v: number | undefined) => (v == null ? '' : decimalInput(v));
  const values = food?.per100 ?? prefill;
  return {
    name: food?.name ?? prefill?.name ?? '',
    kcal: text(values?.kcal),
    protein: text(values?.proteinG),
    carbs: text(values?.carbsG),
    fat: text(values?.fatG),
    fiber: text(food?.fiberG),
    ean: food?.ean ?? ean ?? '',
  };
}

const NUTRIENT_FIELDS: readonly { key: keyof FoodFields; label: string }[] = [
  { key: 'kcal', label: 'Energi (kcal)' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbs', label: 'Kolhydrater (g)' },
  { key: 'fat', label: 'Fett (g)' },
  { key: 'fiber', label: 'Fiber (g, valfritt)' },
];

const NO_UNITS: readonly FoodUnit[] = [];

/** Skapa eller redigera ett eget livsmedel (värden per 100 g) och dess enheter. */
export function CustomFoodForm({
  food,
  customUnits = NO_UNITS,
  ean,
  prefill,
  onSaved,
  onCancel,
  onDelete,
}: CustomFoodFormProps) {
  const [fields, setFields] = useState<FoodFields>(() => fieldsFor(food, ean, prefill));
  const [units, setUnits] = useState<FoodUnit[]>(() => [...customUnits]);
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof FoodFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const result = parseFoodFields(fields);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const now = Date.now();
    const saved: StoredFood = {
      id: food?.id ?? `egen:${newId()}`,
      source: 'egen',
      createdAt: food?.createdAt ?? now,
      ...result.value,
    };
    if (food) saved.updatedAt = now;
    await putFood(saved);
    await saveCustomUnits(saved.id, units, now);
    onSaved(saved);
  }

  return (
    <form
      className="card form"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
      aria-labelledby="custom-food-title"
    >
      <h2 className="card-title" id="custom-food-title">
        {food ? 'Redigera livsmedel' : 'Nytt livsmedel'}
      </h2>
      <label className="field">
        <span className="field-label">Namn</span>
        <input
          className="input"
          autoComplete="off"
          value={fields.name}
          onChange={(e) => {
            update('name', e.target.value);
          }}
        />
      </label>
      <fieldset className="fieldset">
        <legend className="field-label">Per 100 g</legend>
        <div className="field-row">
          {NUTRIENT_FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span className="field-label">{f.label}</span>
              <input
                className="input"
                inputMode="decimal"
                autoComplete="off"
                value={fields[f.key] ?? ''}
                onChange={(e) => {
                  update(f.key, e.target.value);
                }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <details className="plan-details" data-testid="food-units">
        <summary>Enheter (valfria)</summary>
        <UnitList
          builtIn={builtInUnits({ id: food?.id ?? 'egen:ny', name: fields.name })}
          custom={units}
          onChange={setUnits}
          canAdd
        />
      </details>
      <label className="field">
        <span className="field-label">Streckkod (valfri)</span>
        <input
          className="input"
          inputMode="numeric"
          autoComplete="off"
          value={fields.ean}
          onChange={(e) => {
            update('ean', e.target.value);
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
          Spara livsmedel
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
          Ta bort livsmedlet
        </button>
      )}
    </form>
  );
}
