import { useMemo, useState } from 'react';
import {
  deleteFood,
  deleteMeal,
  putFood,
  putMeal,
  saveCustomUnits,
  setFavorite,
  type SavedMeal,
  type StoredFood,
} from '../db/db.ts';
import { formatGrams, formatKcal } from '../lib/format.ts';
import { totalOf } from '../lib/nutrition.ts';
import { loggedAmountText } from '../lib/units.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { Card } from './Card.tsx';
import { CustomFoodForm } from './CustomFoodForm.tsx';
import type { FoodSource } from './FoodPicker.tsx';
import { ListRow } from './ListRow.tsx';
import { MealBuilder } from './MealBuilder.tsx';
import { Toast } from './Toast.tsx';

interface OwnFoodsProps {
  /** Livsmedel, måltider och egna enheter – och det sök-sheeten behöver för ingredienser. */
  source: FoodSource;
  onChange: () => Promise<unknown>;
}

type Editing =
  { kind: 'food'; food: StoredFood | null } | { kind: 'meal'; meal: SavedMeal | null } | null;

/**
 * Mat → Egna: sparade måltider och egna livsmedel som listor. Tryck = redigera,
 * svep vänster = ta bort (med Ångra). "Ny …" är sekundärknappar i kortens rubrikrad.
 */
export function OwnFoods({ source, onChange }: OwnFoodsProps) {
  const { foods, meals, favorites, foodUnits } = source.foodData;
  const [editing, setEditing] = useState<Editing>(null);
  const toast = useUndoToast();
  const own = useMemo(() => foods.filter((f) => f.source === 'egen'), [foods]);
  const customUnits = useMemo(
    () => new Map(foodUnits.map((u) => [u.foodId, u.units])),
    [foodUnits],
  );

  /**
   * Tar bort livsmedlet eller måltiden. Borttagningen tar även favoritmarkeringen och
   * de egna enheterna – Ångra lägger tillbaka alla tre.
   */
  async function remove(
    target: { kind: 'food'; food: StoredFood } | { kind: 'meal'; meal: SavedMeal },
  ) {
    const favoriteId = target.kind === 'food' ? target.food.id : `maltid:${target.meal.id}`;
    const wasFavorite = favorites.find((f) => f.foodId === favoriteId);
    const units = customUnits.get(favoriteId) ?? [];
    const name = target.kind === 'food' ? target.food.name : target.meal.name;
    if (target.kind === 'food') await deleteFood(target.food.id);
    else await deleteMeal(target.meal.id);
    setEditing(null);
    await onChange();
    toast.show(`Tog bort ${name}.`, async () => {
      if (target.kind === 'food') await putFood(target.food);
      else await putMeal(target.meal);
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
                primary={meal.name}
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
                primary={food.name}
                secondary={`Per 100 g · ${formatGrams(food.per100.proteinG)} protein`}
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
    </>
  );
}
