import { useState } from 'react';
import { entryCountText } from '../lib/foodDay.ts';
import {
  MEAL_KIND_LABELS,
  minutesOf,
  nearestMeal,
  sortMealSlots,
  type MealId,
  type MealSlot,
} from '../lib/mealSlots.ts';
import { ChoiceList } from './ChoiceList.tsx';

interface MealSlotRemoveProps {
  slot: MealSlot;
  /** Övriga måltider – posterna flyttas till en av dem. */
  others: readonly MealSlot[];
  /** Antal poster i matloggen i måltiden. */
  count: number;
  onRemove: (targetId: MealId) => void;
  onCancel: () => void;
}

/** Ta bort en måltid med poster: frågar vilken måltid posterna ska flyttas till. */
export function MealSlotRemove({ slot, others, count, onRemove, onCancel }: MealSlotRemoveProps) {
  // Förval: måltiden vars tid ligger närmast (samma typ först).
  const [target, setTarget] = useState<MealId | null>(
    () =>
      (
        nearestMeal(
          others.filter((m) => m.kind === slot.kind),
          minutesOf(slot.time),
        ) ?? nearestMeal(others, minutesOf(slot.time))
      )?.id ?? null,
  );
  const options = sortMealSlots(others).map((m) => ({
    id: m.id,
    label: m.name,
    description: `${m.time} · ${MEAL_KIND_LABELS[m.kind]}`,
  }));

  return (
    <div className="form" data-testid="meal-slot-remove">
      <p className="form-note">
        {slot.name} har {entryCountText(count)} i matloggen. Vilken måltid ska de flyttas till?
      </p>
      <ChoiceList
        legend="Flytta posterna till"
        name="meal-target"
        options={options}
        value={target}
        onChange={setTarget}
      />
      <button
        type="button"
        className="button button-danger"
        disabled={target === null}
        onClick={() => {
          if (target !== null) onRemove(target);
        }}
      >
        Ta bort och flytta posterna
      </button>
      <button type="button" className="button button-ghost" onClick={onCancel}>
        Avbryt
      </button>
    </div>
  );
}
