import { useId, useState } from 'react';
import type { FoodLogEntry } from '../db/db.ts';
import type { FiberAmount } from '../lib/fiber.ts';
import type { LoggedIngredient } from '../lib/foodDay.ts';
import { formatGrams, formatKcal } from '../lib/format.ts';
import { scaleNutrients } from '../lib/nutrition.ts';
import { formatBase, loggedAmountText } from '../lib/units.ts';
import { ListRow } from './ListRow.tsx';
import { Macros } from './Macros.tsx';

interface FoodEntryRowProps {
  entry: FoodLogEntry;
  /** Ingredienserna om posten är en sparad måltid (annars `null`). */
  ingredients: LoggedIngredient[] | null;
  /** Livsmedlet är favoritmarkerat (visas med en stjärna). */
  favorite: boolean;
  /** Postens fiber: `null` = saknas ("–"), `undefined` = fiberdatan laddas (utelämnas). */
  fiber?: FiberAmount | null | undefined;
  onEdit: () => void;
  onDelete: () => void;
  /** Svep åt höger växlar favorit. */
  onToggleFavorite: () => void;
}

/**
 * En loggad post som `ListRow`: namn, mängd, makron och fiber samt kcal. En snabblogg märks "uppskattat". Tryck öppnar redigering, svep
 * åt vänster tar bort (med Ångra), svep åt höger växlar favorit. En sparad måltid
 * kan fällas ut till ingredienserna.
 */
export function FoodEntryRow({
  entry,
  ingredients,
  favorite,
  fiber,
  onEdit,
  onDelete,
  onToggleFavorite,
}: FoodEntryRowProps) {
  const [open, setOpen] = useState(false);
  const ingredientsId = useId();
  const nutrients = scaleNutrients(entry.per100, entry.grams);

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
          {entry.estimated && (
            <span className="tag tag-estimated" data-testid="estimated-tag">
              uppskattat
            </span>
          )}
        </>
      }
      secondary={
        entry.estimated ? (
          // Snabblogg: bara ev. protein, och fiber saknas alltid.
          <>
            {!entry.foodId.endsWith(':') && (
              <span className="nowrap">
                {formatGrams(Math.round(entry.per100.proteinG))} protein ·{' '}
              </span>
            )}
            <span className="nowrap macro-fiber" data-testid="fiber">
              Fi –<span className="visually-hidden"> (fiberdata saknas)</span>
            </span>
          </>
        ) : (
          <span data-testid="entry-macros">
            <Macros lead={loggedAmountText(entry)} nutrients={nutrients} fiber={fiber} />
          </span>
        )
      }
      value={<span className="kcal">{formatKcal(nutrients.kcal)}</span>}
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
