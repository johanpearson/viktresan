import { newId, type Recipe, type SavedMeal, type StoredFood } from '../db/db.ts';
import { fiberForItem, fiberText, type FiberSource } from '../lib/fiber.ts';
import { mealToItem } from '../lib/foodCatalog.ts';
import { formatGrams, formatKcal } from '../lib/format.ts';
import { totalOf } from '../lib/nutrition.ts';
import { hostOf } from '../lib/recipeImport.ts';
import {
  duplicateRecipe,
  leftovers,
  portionsText,
  recipeFoodId,
  recipeToItem,
  recipeYield,
  yieldText,
} from '../lib/recipes.ts';
import {
  countLogged,
  foodRemovalText,
  loggedEntriesText,
  mealRemovalText,
  recipeRemovalText,
} from '../lib/removal.ts';
import { loggedAmountText } from '../lib/units.ts';
import { DetailSheet } from './DetailSheet.tsx';
import type { FoodSource } from './FoodPicker.tsx';
import { ListRow } from './ListRow.tsx';
import { Macros } from './Macros.tsx';

export type OwnTarget =
  | { kind: 'food'; food: StoredFood }
  | { kind: 'meal'; meal: SavedMeal }
  | { kind: 'recipe'; recipe: Recipe };

interface OwnFoodDetailProps {
  target: OwnTarget;
  source: FoodSource;
  /** Fiber i måltider och recept – `null` tills databaserna är laddade. */
  fiberSource: FiberSource | null;
  onEdit: () => void;
  /** "Duplicera recept": kopian (ny, inte sparad) öppnas för redigering. */
  onDuplicate: (copy: Recipe) => void;
  onRemove: () => void;
  onClose: () => void;
}

function timesText(n: number): string {
  return n === 0 ? 'Aldrig' : loggedEntriesText(n);
}

/**
 * Detaljvyn för ett eget livsmedel, en sparad måltid eller ett recept (Mat → Egna): värdena,
 * ingredienserna och hur ofta det loggats; Redigera öppnar formuläret och "Ta bort …" frågar
 * först – med vad som händer med loggen och matlådorna.
 */
export function OwnFoodDetail({
  target,
  source,
  fiberSource,
  onEdit,
  onDuplicate,
  onRemove,
  onClose,
}: OwnFoodDetailProps) {
  const { foodLog } = source;
  if (target.kind === 'food') {
    const { food } = target;
    const logged = countLogged(foodLog, food.id);
    const fiber = fiberText(
      food.fiberG === undefined ? null : { fiberG: food.fiberG, partial: false },
    ).text;
    return (
      <DetailSheet
        title={food.name}
        testId="own-detail"
        onClose={onClose}
        onEdit={onEdit}
        remove={{
          label: 'Ta bort livsmedlet',
          title: `Ta bort ${food.name}?`,
          consequence: foodRemovalText(logged),
          onConfirm: onRemove,
        }}
      >
        <ListRow
          primary="Per 100 g"
          secondary={
            <Macros
              nutrients={food.per100}
              fiber={food.fiberG === undefined ? null : { fiberG: food.fiberG, partial: false }}
            />
          }
          value={<span className="kcal">{formatKcal(food.per100.kcal)}</span>}
        />
        <ListRow primary="Fiber" value={<span className="num">{fiber}</span>} />
        {food.ean !== undefined && (
          <ListRow primary="Streckkod" value={<span className="num">{food.ean}</span>} />
        )}
        <ListRow primary="Loggat" value={timesText(logged)} />
      </DetailSheet>
    );
  }

  if (target.kind === 'meal') {
    const { meal } = target;
    const logged = countLogged(foodLog, `maltid:${meal.id}`);
    const total = totalOf(meal.items);
    const item = mealToItem(meal);
    const fiber = fiberSource
      ? fiberForItem(
          item,
          meal.items.reduce((s, i) => s + i.grams, 0),
          fiberSource,
        )
      : undefined;
    return (
      <DetailSheet
        title={meal.name}
        testId="own-detail"
        onClose={onClose}
        onEdit={onEdit}
        remove={{
          label: 'Ta bort måltiden',
          title: `Ta bort ${meal.name}?`,
          consequence: mealRemovalText(logged),
          onConfirm: onRemove,
        }}
      >
        <ListRow
          primary="Totalt"
          secondary={<Macros nutrients={total} fiber={fiber} />}
          value={<span className="kcal">{formatKcal(total.kcal)}</span>}
        />
        {meal.items.map((i, n) => (
          <ListRow
            key={`${i.foodId}:${String(n)}`}
            primary={i.name}
            secondary={loggedAmountText(i)}
            value={<span className="kcal">{formatKcal((i.per100.kcal * i.grams) / 100)}</span>}
          />
        ))}
        <ListRow primary="Loggad" value={timesText(logged)} />
      </DetailSheet>
    );
  }

  const { recipe } = target;
  const y = recipeYield(recipe);
  const logged = countLogged(foodLog, recipeFoodId(recipe.id));
  const left = leftovers([recipe], foodLog)[0]?.left ?? 0;
  const fiber =
    fiberSource && y.perPortion && y.portionG !== null
      ? fiberForItem(recipeToItem(recipe), y.portionG, fiberSource)
      : undefined;
  return (
    <DetailSheet
      title={recipe.name}
      testId="own-detail"
      onClose={onClose}
      onEdit={onEdit}
      extra={
        <button
          type="button"
          className="button button-ghost button-small"
          onClick={() => {
            onDuplicate(duplicateRecipe(recipe, newId()));
          }}
        >
          Duplicera recept
        </button>
      }
      remove={{
        label: 'Ta bort receptet',
        title: `Ta bort ${recipe.name}?`,
        consequence: recipeRemovalText(logged, left),
        onConfirm: onRemove,
      }}
    >
      <ListRow primary="Utbyte" value={yieldText(y, formatGrams) || '–'} wrapValue />
      {y.perPortion && (
        <ListRow
          primary="Per portion"
          secondary={<Macros nutrients={y.perPortion} fiber={fiber} />}
          value={<span className="kcal">{formatKcal(y.perPortion.kcal)}</span>}
        />
      )}
      <ListRow
        primary="Ingredienser"
        secondary={recipe.items.map((i) => `${i.name} ${loggedAmountText(i)}`).join(', ')}
        value={String(recipe.items.length)}
      />
      {left > 0 && <ListRow primary="Matlådor" value={`${portionsText(left)} kvar`} />}
      {recipe.sourceUrl !== undefined && (
        <ListRow
          primary="Källa"
          value={
            <span data-testid="recipe-source">
              <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
                {hostOf(recipe.sourceUrl)}
              </a>
            </span>
          }
        />
      )}
      <ListRow primary="Loggat" value={timesText(logged)} />
    </DetailSheet>
  );
}
