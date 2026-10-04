import { useMemo, useState } from 'react';
import {
  deleteFood,
  deleteMeal,
  deleteRecipe,
  putFood,
  putMeal,
  putRecipe,
  saveCustomUnits,
  setFavorite,
  type Recipe,
  type SavedMeal,
  type StoredFood,
} from '../db/db.ts';
import { claimsFor } from '../lib/claims.ts';
import {
  buildCatalog,
  fiberSourceFor,
  mealToItem,
  storedItems,
  storedToItem,
} from '../lib/foodCatalog.ts';
import { formatGrams, formatKcal } from '../lib/format.ts';
import { totalOf } from '../lib/nutrition.ts';
import { recipeFoodId, recipeToItem, recipeYield, yieldText } from '../lib/recipes.ts';
import { loggedAmountText } from '../lib/units.ts';
import { setPendingShare } from '../lib/shareTarget.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { Card } from './Card.tsx';
import { ClaimTags } from './ClaimTags.tsx';
import { CustomFoodForm } from './CustomFoodForm.tsx';
import type { FoodSource } from './FoodPicker.tsx';
import { ListRow } from './ListRow.tsx';
import { Macros } from './Macros.tsx';
import { MealBuilder } from './MealBuilder.tsx';
import { RecipeBuilder } from './RecipeBuilder.tsx';
import { RecipeImport } from './RecipeImport.tsx';
import { Toast } from './Toast.tsx';

interface OwnFoodsProps {
  /** Livsmedel, måltider och egna enheter – och det sök-sheeten behöver för ingredienser. */
  source: FoodSource;
  onChange: () => Promise<unknown>;
  /**
   * Öppna "Importera recept" direkt (`#/mat/importera`, delningsmenyn) – förifyllt med den
   * delade länken eller texten. `null` = stängd.
   */
  initialImport?: string | null;
  /** Importpanelen stängdes (så att den inte öppnas igen vid nästa flikbyte). */
  onImportClosed?: () => void;
}

type Editing =
  | { kind: 'food'; food: StoredFood | null }
  | { kind: 'meal'; meal: SavedMeal | null }
  | { kind: 'recipe'; recipe: Recipe | null }
  | null;

type Removable =
  | { kind: 'food'; food: StoredFood }
  | { kind: 'meal'; meal: SavedMeal }
  | { kind: 'recipe'; recipe: Recipe };

function foodIdOf(target: Removable): string {
  switch (target.kind) {
    case 'food':
      return target.food.id;
    case 'meal':
      return `maltid:${target.meal.id}`;
    case 'recipe':
      return recipeFoodId(target.recipe.id);
  }
}

function nameOf(target: Removable): string {
  switch (target.kind) {
    case 'food':
      return target.food.name;
    case 'meal':
      return target.meal.name;
    case 'recipe':
      return target.recipe.name;
  }
}

/**
 * Mat → Egna: sparade måltider, recept och egna livsmedel som listor. Tryck = redigera,
 * svep vänster = ta bort (med Ångra). "Ny …" är sekundärknappar i kortens rubrikrad.
 */
export function OwnFoods({
  source,
  onChange,
  initialImport = null,
  onImportClosed,
}: OwnFoodsProps) {
  const { foods, meals, favorites, foodUnits, recipes } = source.foodData;
  const [editing, setEditing] = useState<Editing>(null);
  /** Importpanelen: förifylld länk eller text, `null` = stängd. */
  const [importing, setImporting] = useState<string | null>(initialImport);
  const toast = useUndoToast();
  const own = useMemo(() => foods.filter((f) => f.source === 'egen'), [foods]);
  const customUnits = useMemo(
    () => new Map(foodUnits.map((u) => [u.foodId, u.units])),
    [foodUnits],
  );
  // Fiber i måltider och recept (för etiketterna) – först när livsmedelsdatabaserna är laddade.
  const { livsmedel } = source;
  const fiberSource = useMemo(
    () =>
      livsmedel
        ? fiberSourceFor(
            buildCatalog(livsmedel.foods, storedItems(source.foodData)),
            source.foodData,
          )
        : null,
    [livsmedel, source.foodData],
  );

  /**
   * Tar bort livsmedlet eller måltiden. Borttagningen tar även favoritmarkeringen och
   * de egna enheterna – Ångra lägger tillbaka alla tre.
   */
  async function remove(target: Removable) {
    const favoriteId = foodIdOf(target);
    const wasFavorite = favorites.find((f) => f.foodId === favoriteId);
    const units = customUnits.get(favoriteId) ?? [];
    const name = nameOf(target);
    if (target.kind === 'food') await deleteFood(target.food.id);
    else if (target.kind === 'meal') await deleteMeal(target.meal.id);
    else await deleteRecipe(target.recipe.id);
    setEditing(null);
    await onChange();
    toast.show(`Tog bort ${name}.`, async () => {
      if (target.kind === 'food') await putFood(target.food);
      else if (target.kind === 'meal') await putMeal(target.meal);
      else await putRecipe(target.recipe);
      if (wasFavorite) await setFavorite(favoriteId, true, wasFavorite.createdAt);
      if (units.length > 0) await saveCustomUnits(favoriteId, units);
      await onChange();
    });
  }

  async function saved(message: string) {
    setEditing(null);
    await onChange();
    toast.show(message);
  }

  function closeImport() {
    setImporting(null);
    setPendingShare(null);
    onImportClosed?.();
  }

  const toastView = toast.toast && (
    <Toast
      label="Egna"
      testId="own-toast"
      message={toast.toast.message}
      onUndo={toast.onUndo}
      onClose={toast.close}
    />
  );

  if (editing?.kind === 'food') {
    const { food } = editing;
    return (
      <CustomFoodForm
        food={food}
        customUnits={food ? (customUnits.get(food.id) ?? []) : []}
        onSaved={(next) => void saved(`Sparade ${next.name}.`)}
        onCancel={() => {
          setEditing(null);
        }}
        {...(food ? { onDelete: () => void remove({ kind: 'food', food }) } : {})}
      />
    );
  }
  if (editing?.kind === 'recipe') {
    const { recipe } = editing;
    return (
      <>
        <RecipeBuilder
          // Ny nyckel när en kopia öppnas, så att formuläret fylls i på nytt.
          key={recipe?.id ?? 'nytt'}
          recipe={recipe}
          source={source}
          onSaved={(next) => void saved(`Sparade receptet ${next.name}.`)}
          onDuplicated={(copy) => {
            void onChange().then(() => {
              setEditing({ kind: 'recipe', recipe: copy });
              toast.show(`Skapade ${copy.name}. Ändra det du vill och spara.`);
            });
          }}
          onCancel={() => {
            setEditing(null);
          }}
          {...(recipe ? { onDelete: () => void remove({ kind: 'recipe', recipe }) } : {})}
        />
        {toastView}
      </>
    );
  }
  if (editing?.kind === 'meal') {
    const { meal } = editing;
    return (
      <MealBuilder
        meal={meal}
        source={source}
        onSaved={(next) => void saved(`Sparade måltiden ${next.name}.`)}
        onCancel={() => {
          setEditing(null);
        }}
        {...(meal ? { onDelete: () => void remove({ kind: 'meal', meal }) } : {})}
      />
    );
  }

  return (
    <>
      <Card
        title="Måltider"
        action={
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => {
              toast.close();
              setEditing({ kind: 'meal', meal: null });
            }}
          >
            Ny måltid
          </button>
        }
      >
        {meals.length === 0 ? (
          <p className="muted">
            Spara måltider du äter ofta, t.ex. frukostgröten, så loggar du dem med ett tryck.
          </p>
        ) : (
          <ul className="list">
            {meals.map((meal) => (
              <ListRow
                key={meal.id}
                testId="own-meal"
                primary={
                  <>
                    {meal.name}
                    <ClaimTags claims={claimsFor(mealToItem(meal), fiberSource)} />
                  </>
                }
                secondary={meal.items.map((i) => `${i.name} ${loggedAmountText(i)}`).join(', ')}
                value={<span className="kcal">{formatKcal(totalOf(meal.items).kcal)}</span>}
                onClick={() => {
                  toast.close();
                  setEditing({ kind: 'meal', meal });
                }}
                swipeLeft={{
                  label: 'Ta bort',
                  onSwipe: () => void remove({ kind: 'meal', meal }),
                }}
              />
            ))}
          </ul>
        )}
      </Card>
      <Card
        title="Recept"
        action={
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => {
              toast.close();
              setEditing({ kind: 'recipe', recipe: null });
            }}
          >
            Nytt recept
          </button>
        }
      >
        {recipes.length === 0 && (
          <p className="muted">
            Lägg in grytor och annat du lagar i omgångar, så loggar du en portion eller vägd mängd.
          </p>
        )}
        <ul className="list">
          <ListRow
            testId="recipe-import-open"
            primary="Importera recept"
            secondary="Från en länk, en receptext eller en bild – med AI"
            chevron
            onClick={() => {
              toast.close();
              setImporting('');
            }}
          />
          {recipes.map((recipe) => {
            const y = recipeYield(recipe);
            return (
              <ListRow
                key={recipe.id}
                testId="own-recipe"
                primary={
                  <>
                    {recipe.name}
                    <ClaimTags claims={claimsFor(recipeToItem(recipe), fiberSource)} />
                  </>
                }
                secondary={yieldText(y, formatGrams)}
                value={
                  <span className="kcal">
                    {y.perPortion
                      ? `${formatKcal(y.perPortion.kcal)}/portion`
                      : `${formatKcal(y.per100.kcal)}/100 g`}
                  </span>
                }
                onClick={() => {
                  toast.close();
                  setEditing({ kind: 'recipe', recipe });
                }}
                swipeLeft={{
                  label: 'Ta bort',
                  onSwipe: () => void remove({ kind: 'recipe', recipe }),
                }}
              />
            );
          })}
        </ul>
      </Card>
      <Card
        title="Egna livsmedel"
        action={
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => {
              toast.close();
              setEditing({ kind: 'food', food: null });
            }}
          >
            Nytt livsmedel
          </button>
        }
      >
        {own.length === 0 ? (
          <p className="muted">Lägg till livsmedel som saknas, med värden från förpackningen.</p>
        ) : (
          <ul className="list">
            {own.map((food) => (
              <ListRow
                key={food.id}
                testId="own-food"
                primary={
                  <>
                    {food.name}
                    <ClaimTags claims={claimsFor(storedToItem(food), null)} />
                  </>
                }
                secondary={
                  <Macros
                    lead="Per 100 g"
                    nutrients={food.per100}
                    fiber={
                      food.fiberG === undefined ? null : { fiberG: food.fiberG, partial: false }
                    }
                  />
                }
                value={<span className="kcal">{formatKcal(food.per100.kcal)}</span>}
                onClick={() => {
                  toast.close();
                  setEditing({ kind: 'food', food });
                }}
                swipeLeft={{
                  label: 'Ta bort',
                  onSwipe: () => void remove({ kind: 'food', food }),
                }}
              />
            ))}
          </ul>
        )}
      </Card>
      {toastView}
      {importing !== null && (
        <BottomSheet title="Importera recept" full onClose={closeImport}>
          <RecipeImport
            source={source}
            initialInput={importing}
            onSaved={(recipe) => {
              closeImport();
              void saved(`Sparade receptet ${recipe.name}.`);
            }}
            onCancel={closeImport}
          />
        </BottomSheet>
      )}
    </>
  );
}
