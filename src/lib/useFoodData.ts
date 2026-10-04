import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listAllFoods,
  listAllMeals,
  listCustomUnits,
  listFavorites,
  listFoodOverrides,
  listHiddenFoods,
  listMealSlots,
  listRecipes,
  type CustomUnits,
  type HiddenFood,
  type FoodOverride,
  type Recipe,
  type Favorite,
  type SavedMeal,
  type StoredFood,
} from '../db/db.ts';
import { applyOverrides, overrideMap } from './foodNutrition.ts';
import { defaultMealSlots, type MealSlot } from './mealSlots.ts';
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
  /** Dagens måltider (Inställningar → Måltider) i listans ordning. */
  mealSlots: MealSlot[];
  /** Dolt i matsökningen (livsmedel, kategorier, källor) – `filtersFrom` (foodFilters.ts). */
  hidden: HiddenFood[];
  /**
   * Borttagna egna livsmedel och måltider: syns inte, men tidigare loggars fiber och
   * ingredienser slås upp i dem (`fiberSourceFor`).
   */
  removed: { foods: StoredFood[]; meals: SavedMeal[] };
}

const EMPTY: FoodData = {
  foods: [],
  meals: [],
  favorites: [],
  foodUnits: [],
  recipes: [],
  overrides: [],
  mealSlots: defaultMealSlots(),
  hidden: [],
  removed: { foods: [], meals: [] },
};

/**
 * Egna livsmedel, cachade produkter, måltider, recept, favoriter, egna enheter och dolt i
 * matsökningen från IndexedDB,
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
      const [allFoods, allMeals, favorites, foodUnits, recipes, overrides, mealSlots, hidden] =
        await Promise.all([
          listAllFoods(),
          listAllMeals(),
          listFavorites(),
          listCustomUnits(),
          listRecipes(),
          listFoodOverrides(),
          listMealSlots(),
          listHiddenFoods(),
        ]);
      return {
        foods: allFoods.filter((f) => f.deletedAt === undefined),
        meals: allMeals.filter((m) => m.deletedAt === undefined),
        favorites,
        foodUnits,
        recipes,
        overrides,
        mealSlots,
        hidden,
        removed: {
          foods: allFoods.filter((f) => f.deletedAt !== undefined),
          meals: allMeals.filter((m) => m.deletedAt !== undefined),
        },
      };
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
