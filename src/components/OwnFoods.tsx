import { useMemo, useState } from 'react';
import {
  deleteFood,
  deleteMeal,
  type CustomUnits,
  type SavedMeal,
  type StoredFood,
} from '../db/db.ts';
import type { FoodItem } from '../lib/foodSearch.ts';
import { formatKcal } from '../lib/format.ts';
import { totalOf } from '../lib/nutrition.ts';
import { loggedAmountText } from '../lib/units.ts';
import { CustomFoodForm } from './CustomFoodForm.tsx';
import { MealBuilder } from './MealBuilder.tsx';

interface OwnFoodsProps {
  foods: readonly StoredFood[];
  meals: readonly SavedMeal[];
  foodUnits: readonly CustomUnits[];
  searchItems: readonly FoodItem[];
  loading: boolean;
  onChange: () => Promise<unknown>;
}

type Editing =
  { kind: 'food'; food: StoredFood | null } | { kind: 'meal'; meal: SavedMeal | null } | null;

/** Egna livsmedel och sparade måltider: skapa, redigera, ta bort. */
export function OwnFoods({
  foods,
  meals,
  foodUnits,
  searchItems,
  loading,
  onChange,
}: OwnFoodsProps) {
  const [editing, setEditing] = useState<Editing>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const own = useMemo(() => foods.filter((f) => f.source === 'egen'), [foods]);
  const customUnits = useMemo(
    () => new Map(foodUnits.map((u) => [u.foodId, u.units])),
    [foodUnits],
  );

  async function remove(id: string, name: string, kind: 'food' | 'meal') {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    if (kind === 'food') await deleteFood(id);
    else await deleteMeal(id);
    setConfirmId(null);
    await onChange();
    setStatus(`${name} är borttaget.`);
  }

  async function saved(message: string) {
    setEditing(null);
    await onChange();
    setStatus(message);
  }

  if (editing?.kind === 'food') {
    return (
      <CustomFoodForm
        food={editing.food}
        customUnits={editing.food ? (customUnits.get(editing.food.id) ?? []) : []}
        onSaved={(food) => void saved(`Sparade ${food.name}.`)}
        onCancel={() => {
          setEditing(null);
        }}
      />
    );
  }
  if (editing?.kind === 'meal') {
    return (
      <MealBuilder
        meal={editing.meal}
        searchItems={searchItems}
        customUnits={customUnits}
        loading={loading}
        onSaved={(meal) => void saved(`Sparade måltiden ${meal.name}.`)}
        onCancel={() => {
          setEditing(null);
        }}
      />
    );
  }

  function deleteButton(id: string, name: string, kind: 'food' | 'meal') {
    return (
      <button
        type="button"
        className="button button-danger button-small"
        aria-label={confirmId === id ? `Bekräfta borttagning av ${name}` : `Ta bort ${name}`}
        onClick={() => void remove(id, name, kind)}
      >
        {confirmId === id ? 'Bekräfta' : 'Ta bort'}
      </button>
    );
  }

  return (
    <>
      <p className="form-ok" role="status">
        {status}
      </p>
      <section className="card" aria-labelledby="meals-title">
        <div className="card-header">
          <h2 className="card-title" id="meals-title">
            Måltider
          </h2>
          <button
            type="button"
            className="button button-small"
            onClick={() => {
              setEditing({ kind: 'meal', meal: null });
            }}
          >
            Ny måltid
          </button>
        </div>
        {meals.length === 0 ? (
          <p className="muted">
            Spara måltider du äter ofta, t.ex. frukostgröten, så loggar du dem med ett tryck.
          </p>
        ) : (
          <ul className="entry-list">
            {meals.map((meal) => {
              const kcal = totalOf(meal.items).kcal;
              return (
                <li key={meal.id} className="entry" data-testid="own-meal">
                  <div className="entry-main">
                    <span className="entry-date">{meal.name}</span>
                    <span className="entry-weight">{formatKcal(kcal)}</span>
                  </div>
                  <p className="entry-extra">
                    {meal.items.map((i) => `${i.name} ${loggedAmountText(i)}`).join(', ')}
                  </p>
                  <div className="entry-actions">
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      aria-label={`Redigera ${meal.name}`}
                      onClick={() => {
                        setEditing({ kind: 'meal', meal });
                      }}
                    >
                      Redigera
                    </button>
                    {deleteButton(meal.id, meal.name, 'meal')}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="card" aria-labelledby="own-foods-title">
        <div className="card-header">
          <h2 className="card-title" id="own-foods-title">
            Egna livsmedel
          </h2>
          <button
            type="button"
            className="button button-small"
            onClick={() => {
              setEditing({ kind: 'food', food: null });
            }}
          >
            Nytt livsmedel
          </button>
        </div>
        {own.length === 0 ? (
          <p className="muted">Lägg till livsmedel som saknas, med värden från förpackningen.</p>
        ) : (
          <ul className="entry-list">
            {own.map((food) => (
              <li key={food.id} className="entry" data-testid="own-food">
                <div className="entry-main">
                  <span className="entry-date">{food.name}</span>
                  <span className="entry-weight">{formatKcal(food.per100.kcal)}/100 g</span>
                </div>
                <div className="entry-actions">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    aria-label={`Redigera ${food.name}`}
                    onClick={() => {
                      setEditing({ kind: 'food', food });
                    }}
                  >
                    Redigera
                  </button>
                  {deleteButton(food.id, food.name, 'food')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
