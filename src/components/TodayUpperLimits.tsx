import { useEffect, useMemo, useState } from 'react';
import type { ExtraNutrients } from '../data/nutrients.ts';
import { listMeals, type SavedMeal } from '../db/db.ts';
import { useFeatures } from '../lib/features.ts';
import { loadLivsmedel } from '../lib/livsmedel.ts';
import { dayNutrition, upperLimitWarnings } from '../lib/micronutrients.ts';
import type { AppData } from '../lib/useAppData.ts';
import { UpperLimitWarnings } from './UpperLimitWarnings.tsx';

interface TodayUpperLimitsProps {
  data: AppData;
  today: string;
}

interface FoodLookup {
  extra: ReadonlyMap<string, ExtraNutrients | null>;
  meals: SavedMeal[];
}

/**
 * Översikt: varningen för övre gränsvärden samma dag (mat + tillskott). Livsmedelsverkets
 * data läses bara in när något ätits idag – annars räcker tillskotten.
 */
export function TodayUpperLimits({ data, today }: TodayUpperLimitsProps) {
  const features = useFeatures();
  const foodOn = features.isEnabled('mat');
  const supplementsOn = features.isEnabled('tillskott');
  const hasFood = foodOn && data.foodLog.some((e) => e.date === today);
  const [lookup, setLookup] = useState<FoodLookup | null>(null);

  useEffect(() => {
    if (!hasFood) return;
    let active = true;
    void Promise.all([loadLivsmedel(), listMeals()]).then(([livsmedel, meals]) => {
      if (!active) return;
      setLookup({ extra: new Map(livsmedel.foods.map((f) => [f.id, f.extra ?? null])), meals });
    });
    return () => {
      active = false;
    };
  }, [hasFood]);

  const warnings = useMemo(() => {
    const day = dayNutrition(today, {
      foodLog: hasFood && lookup ? data.foodLog : [],
      meals: lookup?.meals ?? [],
      lookup: (id) => lookup?.extra.get(id),
      supplementLog: supplementsOn ? data.supplementLog : [],
    });
    return upperLimitWarnings(day);
  }, [today, hasFood, lookup, data.foodLog, data.supplementLog, supplementsOn]);

  if (!foodOn && !supplementsOn) return null;
  return (
    <UpperLimitWarnings
      warnings={warnings}
      when="idag"
      href={foodOn ? '#/mat/naring' : undefined}
    />
  );
}
