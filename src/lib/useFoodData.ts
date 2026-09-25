import { useCallback, useEffect, useState } from 'react';
import {
  listFavorites,
  listFoods,
  listMeals,
  type Favorite,
  type SavedMeal,
  type StoredFood,
} from '../db/db.ts';
import { loadLivsmedel, type Livsmedel } from './livsmedel.ts';

export interface FoodData {
  foods: StoredFood[];
  meals: SavedMeal[];
  favorites: Favorite[];
}

const EMPTY: FoodData = { foods: [], meals: [], favorites: [] };

/**
 * Egna livsmedel, cachade produkter, måltider och favoriter från IndexedDB,
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
      const [foods, meals, favorites] = await Promise.all([
        listFoods(),
        listMeals(),
        listFavorites(),
      ]);
      return { foods, meals, favorites };
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
