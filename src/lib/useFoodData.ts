import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listCustomUnits,
  listFavorites,
  listFoodOverrides,
  listFoods,
  listMeals,
  listRecipes,
  type CustomUnits,
  type FoodOverride,
  type Recipe,
  type Favorite,
  type SavedMeal,
  type StoredFood,
} from '../db/db.ts';
import { applyOverrides, overrideMap } from './foodNutrition.ts';
import { loadLivsmedel, type Livsmedel } from './livsmedel.ts';

export interface FoodData {
  foods: StoredFood[];
  meals: SavedMeal[];
  favorites: Favorite[];
  /** Användarens egna enheter per livsmedel. */
  foodUnits: CustomUnits[];
  recipes: Recipe[];
  /**
   * Egna näringsvärden (komplettering av OFF/Livsmedelsverket/Fineli). Redan inlagda i
   * `livsmedel` från hooken; för `foods` används `storedItems` (foodCatalog.ts).
   */
  overrides: FoodOverride[];
}

const EMPTY: FoodData = {
  foods: [],
  meals: [],
  favorites: [],
  foodUnits: [],
  recipes: [],
  overrides: [],
};

/**
 * Egna livsmedel, cachade produkter, måltider, recept, favoriter och egna enheter från IndexedDB,
 * samt Livsmedelsverkets och Finelis databaser (laddas separat – `null` tills de är klara) med
 * användarens egna näringsvärden inlagda.
 */
export function useFoodData(): {
  data: FoodData | null;
  livsmedel: Livsmedel | null;
  reload: () => Promise<FoodData>;
} {
  const [data, setData] = useState<FoodData | null>(null);
  const [rawLivsmedel, setLivsmedel] = useState<Livsmedel | null>(null);

  const load = useCallback(async (): Promise<FoodData> => {
    try {
      const [foods, meals, favorites, foodUnits, recipes, overrides] = await Promise.all([
        listFoods(),
        listMeals(),
        listFavorites(),
        listCustomUnits(),
        listRecipes(),
        listFoodOverrides(),
      ]);
      return { foods, meals, favorites, foodUnits, recipes, overrides };
    } catch {
      return EMPTY;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (active) setData(result);
    });
    void loadLivsmedel().then((result) => {
      if (active) setLivsmedel(result);
    });
    return () => {
      active = false;
    };
  }, [load]);

  const reload = useCallback(async () => {
    const next = await load();
    setData(next);
    return next;
  }, [load]);

  const overrides = data?.overrides;
  const livsmedel = useMemo(() => {
    if (!rawLivsmedel || !overrides || overrides.length === 0) return rawLivsmedel;
    const foods = applyOverrides(rawLivsmedel.foods, overrideMap(overrides));
    return { ...rawLivsmedel, foods: [...foods] };
  }, [rawLivsmedel, overrides]);

  return { data, livsmedel, reload };
}
