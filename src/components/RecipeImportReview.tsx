import { useMemo, useState, type SyntheticEvent } from 'react';
import { newId, putRecipe, type MealIngredient, type Recipe } from '../db/db.ts';
import { buildCatalog, storedToItem } from '../lib/foodCatalog.ts';
import { buildIndex, type FoodItem } from '../lib/foodSearch.ts';
import { decimalInput, formatGrams, formatKcal, parseDecimal } from '../lib/format.ts';
import { saveMatches, type MatchMemory } from '../lib/matchMemory.ts';
import { totalOf } from '../lib/nutrition.ts';
import {
  CONFIDENCE_LABELS,
  buildImportRows,
  confidenceOf,
  hostOf,
  memoryNames,
  type Confidence,
  type ImportRow,
  type ImportedRecipe,
  type ResolvedAmount,
} from '../lib/recipeImport.ts';
import { SERVINGS_MAX, recipeToSave } from '../lib/recipes.ts';
import { GRAM, type Usage } from '../lib/units.ts';
import { Card } from './Card.tsx';
import { FoodPicker, type FoodSource } from './FoodPicker.tsx';
import { ListRow } from './ListRow.tsx';

interface RecipeImportReviewProps {
  recipe: ImportedRecipe;
  source: FoodSource;
  memory: MatchMemory;
  onSaved: (recipe: Recipe) => void;
  onBack: () => void;
}

/** En ingrediens som den ser ut nu: förslaget eller användarens val. */
interface ReviewRow {
  row: ImportRow;
  skipped: boolean;
  food: FoodItem | null;
  resolved: ResolvedAmount | null;
  confidence: Confidence;
  /** Vald i sök-sheeten (sparas i matchningsminnet). */
  manual: boolean;
}

const NO_FOODS: readonly FoodItem[] = [];

/** Förvald mängd i sök-sheeten: det valda/föreslagna, annars det som stod i receptet. */
function usageFor(review: ReviewRow): Usage | null {
  if (review.resolved) return { unit: review.resolved.unit, amount: review.resolved.amount };
  const q = review.row.quantity;
  if (q.grams !== null) return { unit: GRAM, amount: q.grams };
  if (q.amount !== null) return { unit: q.unit ?? 'st', amount: q.amount };
  return null;
}

function toIngredient(food: FoodItem, resolved: ResolvedAmount): MealIngredient {
  const item: MealIngredient = {
    foodId: food.id,
    name: food.name,
    amount: resolved.amount,
    unit: resolved.unit,
    grams: resolved.grams,
    per100: food.per100,
  };
  if (food.per100Unit === 'ml') item.per100Unit = 'ml';
  return item;
}

/**
 * Granskning av ett importerat recept: en rad per ingrediens med originaltexten, föreslaget
 * livsmedel, gram och kcal samt säkerhetsnivå. Tryck på en rad = välj livsmedel och mängd i
 * sök-sheeten (med skanner); salt, vatten och annat "efter smak" hoppas över med ett tryck.
 * Manuella val sparas i matchningsminnet så att nästa import blir bättre.
 */
export function RecipeImportReview({
  recipe,
  source,
  memory,
  onSaved,
  onBack,
}: RecipeImportReviewProps) {
  const { foodData, livsmedel } = source;
  const [name, setName] = useState(recipe.name);
  const [servings, setServings] = useState(
    recipe.servings !== null ? decimalInput(recipe.servings) : '',
  );
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  const [manual, setManual] = useState<
    Readonly<Record<number, { food: FoodItem; resolved: ResolvedAmount }>>
  >({});
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Kandidater: egna livsmedel (även cachade Open Food Facts-träffar) och Livsmedelsverkets.
  const custom = useMemo(() => foodData.foods.map(storedToItem), [foodData.foods]);
  const lvFoods = livsmedel?.foods ?? NO_FOODS;
  const catalog = useMemo(() => buildCatalog(lvFoods, custom), [lvFoods, custom]);
  const index = useMemo(() => buildIndex([...custom, ...lvFoods]), [custom, lvFoods]);
  const customUnits = useMemo(
    () => new Map(foodData.foodUnits.map((u) => [u.foodId, u.units])),
    [foodData.foodUnits],
  );
  const rows = useMemo(
    () => buildImportRows(recipe, { index, catalog, memory, customUnits }),
    [recipe, index, catalog, memory, customUnits],
  );

  const review: ReviewRow[] = rows.map((row, i) => {
    const chosen = manual[i];
    const food = chosen?.food ?? row.match?.food ?? null;
    const resolved = chosen ? chosen.resolved : row.resolved;
    return {
      row,
      skipped: skipped.has(i),
      food,
      resolved,
      confidence: chosen ? 'hog' : confidenceOf(row.match, row.resolved),
      manual: chosen !== undefined,
    };
  });
  const included = review.filter((r) => !r.skipped);
  const toCheck = included.filter((r) => r.confidence !== 'hog').length;
  const items = included.flatMap((r) =>
    r.food && r.resolved ? [toIngredient(r.food, r.resolved)] : [],
  );
  const totals = totalOf(items);
  const servingsValue = parseDecimal(servings);
  const servingsOk = servingsValue != null && servingsValue >= 0.5 && servingsValue <= SERVINGS_MAX;

  function toggleSkip(i: number) {
    setError(null);
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 120) {
      setError('Ge receptet ett namn.');
      return;
    }
    if (!servingsOk) {
      setError(`Ange antal portioner (0,5–${String(SERVINGS_MAX)}).`);
      return;
    }
    const open = included.filter((r) => r.food === null || r.resolved === null);
    if (open.length > 0) {
      setError(
        `Välj livsmedel och mängd för ${open.map((r) => r.row.ingredient.original).join(', ')} – eller hoppa över.`,
      );
      return;
    }
    if (items.length === 0) {
      setError('Ta med minst en ingrediens.');
      return;
    }
    setSaving(true);
    const saved = recipeToSave(null, {
      id: newId(),
      name: trimmed,
      items,
      servings: servingsValue,
      cookedWeightG: null,
      sourceUrl: recipe.sourceUrl,
    });
    await putRecipe(saved);
    await saveMatches(
      included.flatMap((r) =>
        r.manual && r.food ? [{ names: memoryNames(r.row), foodId: r.food.id }] : [],
      ),
    );
    onSaved(saved);
  }

  const pickingRow = picking !== null ? review[picking] : undefined;

  return (
    <>
      <form
        className="form"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        data-testid="recipe-import-review"
      >
        <label className="field">
          <span className="field-label">Receptets namn</span>
          <input
            className="input"
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </label>
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
        {recipe.sourceUrl !== undefined && (
          <p className="form-note" data-testid="recipe-import-source">
            Källa:{' '}
            <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
              {hostOf(recipe.sourceUrl)}
            </a>
          </p>
        )}
        <Card title="Ingredienser">
          {livsmedel === null ? (
            <p className="muted" role="status">
              Laddar livsmedelsdatabasen …
            </p>
          ) : (
            <>
              <p className="form-note muted" data-testid="import-summary">
                {summaryText(review.length, toCheck, review.length - included.length)}
              </p>
              <ul className="list">
                {review.map((r, i) => (
                  <ImportRowView
                    key={i}
                    review={r}
                    onPick={() => {
                      setError(null);
                      setPicking(i);
                    }}
                    onToggleSkip={() => {
                      toggleSkip(i);
                    }}
                  />
                ))}
              </ul>
            </>
          )}
        </Card>
        {items.length > 0 && (
          <ul className="list list-flush" data-testid="import-nutrition">
            {servingsOk && (
              <ListRow
                testId="import-per-portion"
                primary="Per portion"
                value={<span className="kcal">{formatKcal(totals.kcal / servingsValue)}</span>}
              />
            )}
            <ListRow
              primary="Hela receptet"
              secondary={formatGrams(Math.round(items.reduce((s, i) => s + i.grams, 0)))}
              value={<span className="kcal">{formatKcal(totals.kcal)}</span>}
            />
          </ul>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="button" disabled={livsmedel === null}>
            Spara recept
          </button>
          <button type="button" className="button button-secondary" onClick={onBack}>
            Tillbaka
          </button>
        </div>
      </form>
      {/* Utanför formuläret: sök-sheeten har egna formulär. */}
      {picking !== null && pickingRow && (
        <FoodPicker
          source={source}
          title="Välj livsmedel"
          initialQuery={pickingRow.row.quantity.name}
          initialUsage={usageFor(pickingRow)}
          mode={{
            kind: 'ingredient',
            onAdd: (food, value) => {
              setManual((prev) => ({
                ...prev,
                [picking]: { food, resolved: { ...value, certain: true } },
              }));
              setSkipped((prev) => {
                const next = new Set(prev);
                next.delete(picking);
                return next;
              });
              setPicking(null);
            },
          }}
          onClose={() => {
            setPicking(null);
          }}
        />
      )}
    </>
  );
}

function summaryText(total: number, toCheck: number, skipped: number): string {
  const parts = [`${String(total)} ${total === 1 ? 'ingrediens' : 'ingredienser'}`];
  parts.push(toCheck === 0 ? 'alla matchade' : `${String(toCheck)} att granska`);
  if (skipped > 0) parts.push(`${String(skipped)} hoppas över`);
  return parts.join(' · ');
}

function ImportRowView({
  review,
  onPick,
  onToggleSkip,
}: {
  review: ReviewRow;
  onPick: () => void;
  onToggleSkip: () => void;
}) {
  const { row, skipped, food, resolved, confidence } = review;
  const kcal = food && resolved ? (food.per100.kcal * resolved.grams) / 100 : null;
  // Salt, vatten, "efter smak" – och det som saknar träff – kan hoppas över med ett tryck.
  const offerSkip = skipped || row.skippable || confidence === 'ingen';
  const match = food
    ? `${food.name} · ${resolved ? formatGrams(resolved.grams) : 'mängd saknas'}`
    : 'Ingen träff – tryck för att välja';
  return (
    <ListRow
      testId="import-row"
      className={skipped ? 'import-row import-row-skipped' : 'import-row'}
      primary={row.ingredient.original}
      secondary={
        skipped ? (
          'Hoppas över'
        ) : (
          <>
            {match}{' '}
            <span className={`tag tag-confidence tag-confidence-${confidence}`}>
              {CONFIDENCE_LABELS[confidence]}
            </span>
          </>
        )
      }
      value={
        skipped ? undefined : <span className="kcal">{kcal !== null ? formatKcal(kcal) : '–'}</span>
      }
      chevron
      onClick={onPick}
    >
      {offerSkip && (
        <div className="import-row-actions">
          <button
            type="button"
            className="chip chip-small"
            aria-pressed={skipped}
            aria-label={`Hoppa över ${row.ingredient.original}`}
            onClick={onToggleSkip}
          >
            Hoppa över
          </button>
        </div>
      )}
    </ListRow>
  );
}
