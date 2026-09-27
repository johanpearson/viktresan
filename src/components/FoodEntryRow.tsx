import { useId, useState } from 'react';
import type { FoodLogEntry } from '../db/db.ts';
import type { LoggedIngredient } from '../lib/foodDay.ts';
import { formatKcal } from '../lib/format.ts';
import { scaleNutrients } from '../lib/nutrition.ts';
import { formatBase, loggedAmountText } from '../lib/units.ts';
import { ListRow } from './ListRow.tsx';

interface FoodEntryRowProps {
  entry: FoodLogEntry;
  /** Ingredienserna om posten är en sparad måltid (annars `null`). */
  ingredients: LoggedIngredient[] | null;
  /** Livsmedlet är favoritmarkerat (visas med en stjärna). */
  favorite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** Svep åt höger växlar favorit. */
  onToggleFavorite: () => void;
}

/**
 * En loggad post som `ListRow`: namn, mängd och kcal. Tryck öppnar redigering, svep
 * åt vänster tar bort (med Ångra), svep åt höger växlar favorit. En sparad måltid
 * kan fällas ut till ingredienserna.
 */
export function FoodEntryRow({
  entry,
  ingredients,
  favorite,
  onEdit,
  onDelete,
  onToggleFavorite,
}: FoodEntryRowProps) {
  const [open, setOpen] = useState(false);
  const ingredientsId = useId();
  const kcal = scaleNutrients(entry.per100, entry.grams).kcal;

  return (
    <ListRow
      testId="food-entry"
      primary={
        <>
          {favorite && (
            <span className="food-entry-star" data-testid="favorite-star">
              <span aria-hidden="true">★ </span>
              <span className="visually-hidden">Favorit: </span>
            </span>
          )}
          {entry.name}
        </>
      }
      secondary={loggedAmountText(entry)}
      value={<span className="kcal">{formatKcal(kcal)}</span>}
      onClick={onEdit}
      swipeLeft={{ label: 'Ta bort', onSwipe: onDelete }}
      swipeRight={{
        label: favorite ? '☆ Ta bort favorit' : '★ Favorit',
        onSwipe: onToggleFavorite,
      }}
      trailing={
        ingredients && (
          <button
            type="button"
            className="list-row-expand"
            aria-expanded={open}
            aria-controls={ingredientsId}
            aria-label={`Ingredienser i ${entry.name}`}
            onClick={() => {
              setOpen((o) => !o);
            }}
          >
            <span aria-hidden="true" className="chevron" />
          </button>
        )
      }
    >
      {ingredients && open && (
        <ul className="food-entry-ingredients" id={ingredientsId} data-testid="meal-ingredients">
          {ingredients.map((item, i) => (
            <li key={i}>
              <span>
                {item.name} · {formatBase(item.grams, item.per100Unit ?? 'g')}
              </span>
              <span className="kcal">{formatKcal(item.kcal)}</span>
            </li>
          ))}
        </ul>
      )}
    </ListRow>
  );
}
