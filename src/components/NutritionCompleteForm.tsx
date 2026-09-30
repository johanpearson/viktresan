import { useState, type SyntheticEvent } from 'react';
import {
  getFood,
  getFoodOverride,
  putFood,
  putFoodOverride,
  type FoodOverride,
  type NutritionField,
} from '../db/db.ts';
import type { FoodLabel } from '../lib/aiLabel.ts';
import { storedToItem } from '../lib/foodCatalog.ts';
import {
  NUTRITION_FIELDS,
  applyOverride,
  completeStoredFood,
  mergeOverride,
  nutritionValue,
} from '../lib/foodNutrition.ts';
import { SOURCE_LABELS, type FoodItem } from '../lib/foodSearch.ts';
import { decimalInput } from '../lib/format.ts';
import { parseNutritionFields, type NutritionFieldTexts } from '../lib/validation.ts';
import { AiLabelImport } from './AiLabelImport.tsx';
import { ListRow } from './ListRow.tsx';

interface NutritionCompleteFormProps {
  food: FoodItem;
  /** Sparat: livsmedlet med de nya värdena och ev. portionen från AI-importen. */
  onSaved: (updated: FoodItem, portionG: number | null) => void;
  onCancel: () => void;
}

/** Var ett värde i formuläret kommer ifrån. */
type Origin = 'kalla' | 'egen' | 'ai' | 'saknas';

function textsFor(food: FoodItem): NutritionFieldTexts {
  const texts = {} as NutritionFieldTexts;
  for (const { key } of NUTRITION_FIELDS) {
    const value = nutritionValue(food, key);
    texts[key] = value === null ? '' : decimalInput(value);
  }
  return texts;
}

function originsFor(food: FoodItem): Record<NutritionField, Origin> {
  const origins = {} as Record<NutritionField, Origin>;
  for (const { key } of NUTRITION_FIELDS) {
    origins[key] =
      nutritionValue(food, key) === null ? 'saknas' : food.own?.includes(key) ? 'egen' : 'kalla';
  }
  return origins;
}

const LABEL_FIELDS: readonly [NutritionField, keyof FoodLabel][] = [
  ['kcal', 'kcal'],
  ['proteinG', 'proteinG'],
  ['carbsG', 'carbsG'],
  ['fatG', 'fatG'],
  ['fiberG', 'fiberG'],
  ['sugarG', 'sugarG'],
];

/**
 * "Komplettera": livsmedlets sex näringsvärden per 100 g/ml som fält – befintliga förifyllda
 * och märkta med källa, saknade tomma. Även befintliga värden kan rättas. "Fota etiketten
 * med AI" fyller i fälten från etiketten (förhandsvisning först), och allt kan rättas innan
 * sparning. Värdena sparas lokalt som egna näringsvärden kopplade till livsmedlet (och
 * streckkoden); ett eget livsmedel ändras direkt.
 */
export function NutritionCompleteForm({ food, onSaved, onCancel }: NutritionCompleteFormProps) {
  const [texts, setTexts] = useState<NutritionFieldTexts>(() => textsFor(food));
  const [origins, setOrigins] = useState(() => originsFor(food));
  const [portionG, setPortionG] = useState<number | null>(null);
  const [ai, setAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = food.per100Unit ?? 'g';
  const sourceLabel = SOURCE_LABELS[food.source];

  function originText(key: NutritionField): string {
    switch (origins[key]) {
      case 'kalla':
        return `Från ${sourceLabel}`;
      case 'egen':
        return 'Eget värde';
      case 'ai':
        return 'Från etiketten (AI) – granska';
      case 'saknas':
        return 'Saknas';
    }
  }

  function applyLabel(label: FoodLabel) {
    setTexts((prev) => {
      const next = { ...prev };
      for (const [key, field] of LABEL_FIELDS) {
        const value = label[field];
        if (typeof value === 'number') next[key] = decimalInput(value);
      }
      return next;
    });
    setOrigins((prev) => {
      const next = { ...prev };
      for (const [key, field] of LABEL_FIELDS) {
        if (typeof label[field] === 'number') next[key] = 'ai';
      }
      return next;
    });
    setPortionG(label.portionG ?? null);
    setAi(false);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const parsed = parseNutritionFields(texts);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const now = Date.now();
    if (food.source === 'egen') {
      const stored = await getFood(food.id);
      if (!stored) {
        setError('Hittade inte livsmedlet.');
        return;
      }
      const completed = completeStoredFood(stored, parsed.value, now);
      await putFood(completed);
      onSaved(storedToItem(completed), portionG);
      return;
    }
    const values = mergeOverride(food, parsed.value);
    const previous = await getFoodOverride(food.id);
    const override: FoodOverride = {
      foodId: food.id,
      name: food.name,
      values,
      createdAt: previous?.createdAt ?? now,
    };
    if (previous) override.updatedAt = now;
    if (food.ean !== undefined) override.ean = food.ean;
    await putFoodOverride(override);
    onSaved(applyOverride(food, Object.keys(values).length > 0 ? override : undefined), portionG);
  }

  if (ai) {
    return (
      <div className="card">
        <AiLabelImport
          kind="livsmedel"
          ean={food.ean}
          onUse={applyLabel}
          onCancel={() => {
            setAi(false);
          }}
        />
      </div>
    );
  }

  return (
    <form
      className="card form"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
      aria-labelledby="complete-food-title"
      data-testid="nutrition-complete-form"
    >
      <h2 className="card-title" id="complete-food-title">
        Komplettera: {food.name}
      </h2>
      <p className="form-note muted">
        {food.source === 'egen'
          ? `Värden per 100 ${base}. Tomma fält för fiber och socker betyder att värdet saknas.`
          : `Värden per 100 ${base}. Dina värden sparas bara på den här enheten och går före värdena från ${sourceLabel} nästa gång du skannar eller söker. Töm ett eget värde för att gå tillbaka till källans.`}
      </p>
      <ul className="list list-flush">
        <ListRow
          testId="nutrition-ai"
          primary="Fota etiketten med AI"
          secondary="Läs av näringsdeklarationen med en AI-tjänst och granska"
          chevron
          onClick={() => {
            setAi(true);
          }}
        />
      </ul>
      <fieldset className="fieldset">
        <legend className="field-label">Per 100 {base}</legend>
        <div className="field-row">
          {NUTRITION_FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span className="field-label">
                {f.label} ({f.unit})
              </span>
              <input
                className="input"
                inputMode="decimal"
                autoComplete="off"
                data-testid={`complete-${f.key}`}
                aria-describedby={`complete-${f.key}-origin`}
                value={texts[f.key]}
                onChange={(e) => {
                  const value = e.target.value;
                  setTexts((prev) => ({ ...prev, [f.key]: value }));
                }}
              />
              <span
                className={`field-hint origin-${origins[f.key]}`}
                id={`complete-${f.key}-origin`}
                data-testid={`complete-${f.key}-origin`}
              >
                {originText(f.key)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {portionG !== null && (
        <p className="form-note muted" data-testid="complete-portion">
          Portionen från etiketten ({decimalInput(portionG)} {base}) sparas som enheten
          &quot;portion&quot; om livsmedlet saknar en.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="button">
          Spara värden
        </button>
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </form>
  );
}
