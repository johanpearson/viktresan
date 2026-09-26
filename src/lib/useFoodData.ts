import { useCallback, useEffect, useState } from 'react';
import {
  listCustomUnits,
  listFavorites,
  listFoods,
  listMeals,
  type CustomUnits,
  type Favorite,
  type SavedMeal,
  type StoredFood,
} from '../db/db.ts';
import { loadLivsmedel, type Livsmedel } from './livsmedel.ts';

export interface FoodData {
  foods: StoredFood[];
  meals: SavedMeal[];
  favorites: Favorite[];
  /** Användarens egna enheter per livsmedel. */
  foodUnits: CustomUnits[];
}

const EMPTY: FoodData = { foods: [], meals: [], favorites: [], foodUnits: [] };

/**
 * Egna livsmedel, cachade produkter, måltider, favoriter och egna enheter från IndexedDB,
 * samt Livsmedelsverkets databas (laddas separat – `null` tills den är klar).
 */
export function useFoodData(): {
  data: FoodData | null;
  livsmedel: Livsmedel | null;
  reload: () => Promise<FoodData>;
} {
  const [data, setData] = useState<FoodData | null>(null);
  const [livsmedel, setLivsmedel] = useState<Livsmedel | null>(null);

  const load = useCallback(async (): Promise<FoodData> => {
    try {
      const [foods, meals, favorites, foodUnits] = await Promise.all([
        listFoods(),
        listMeals(),
        listFavorites(),
        listCustomUnits(),
      ]);
      return { foods, meals, favorites, foodUnits };
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

  return { data, livsmedel, reload };
}
