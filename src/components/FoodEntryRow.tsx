import { useId, useRef, useState, type PointerEvent } from 'react';
import type { FoodLogEntry } from '../db/db.ts';
import type { LoggedIngredient } from '../lib/foodDay.ts';
import { formatKcal } from '../lib/format.ts';
import { scaleNutrients } from '../lib/nutrition.ts';
import { formatBase, loggedAmountText } from '../lib/units.ts';

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

/** Pixlar innan en rörelse räknas som svep eller scroll. */
const SLOP = 8;
/** Andel av radens bredd som ett svep måste nå för att ta bort (vänster) eller favoritmarkera (höger). */
const DELETE_FRACTION = 0.35;
/** Längsta förskjutning åt höger – raden glider inte ut, den studsar tillbaka. */
const MAX_RIGHT = 160;

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  /** `null` tills rörelsen avgjorts: vågrätt (svep) eller lodrätt (scroll). */
  horizontal: boolean | null;
}

/**
 * En loggad post: namn, mängd och kcal på en rad. Tryck öppnar redigering, svep
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
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const drag = useRef<Drag | null>(null);
  const swiped = useRef(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const ingredientsId = useId();
  const kcal = scaleNutrients(entry.per100, entry.grams).kcal;

  function threshold(): number {
    return Math.max(80, (rowRef.current?.offsetWidth ?? 300) * DELETE_FRACTION);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, horizontal: null };
    swiped.current = false;
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.horizontal === null) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      d.horizontal = Math.abs(dx) > Math.abs(dy);
      if (d.horizontal) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pekaren finns inte längre (t.ex. syntetiska händelser) – svepet fungerar ändå.
        }
      }
    }
    if (d.horizontal) setOffset(Math.min(MAX_RIGHT, dx));
  }

  function onPointerEnd(e: PointerEvent, cancelled: boolean) {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.horizontal) return;
    // Ett svep ska inte också räknas som ett tryck på raden.
    swiped.current = true;
    const dx = e.clientX - d.x;
    if (!cancelled && dx <= -threshold()) {
      setOffset(-(rowRef.current?.offsetWidth ?? 400));
      onDelete();
      return;
    }
    setOffset(0);
    if (!cancelled && dx >= Math.min(MAX_RIGHT, threshold())) onToggleFavorite();
  }

  return (
    <li
      ref={rowRef}
      className="food-entry"
      data-testid="food-entry"
      data-swiping={offset < 0 ? 'left' : offset > 0 ? 'right' : undefined}
    >
      <span className="food-entry-delete" aria-hidden="true">
        Ta bort
      </span>
      <span className="food-entry-favorite" aria-hidden="true">
        {favorite ? '☆ Ta bort favorit' : '★ Favorit'}
      </span>
      <div
        className="food-entry-content"
        // Förskjutningen sätts via CSSOM (React-style) och omfattas inte av CSP:ns style-src.
        style={offset !== 0 ? { transform: `translateX(${String(offset)}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          onPointerEnd(e, false);
        }}
        onPointerCancel={(e) => {
          onPointerEnd(e, true);
        }}
      >
        <div className="food-entry-row">
          <button
            type="button"
            className="food-entry-button"
            onClick={() => {
              if (swiped.current) {
                swiped.current = false;
                return;
              }
              onEdit();
            }}
          >
            <span className="food-entry-text">
              <span className="food-entry-name">
                {favorite && (
                  <span className="food-entry-star" data-testid="favorite-star">
                    <span aria-hidden="true">★ </span>
                    <span className="visually-hidden">Favorit: </span>
                  </span>
                )}
                {entry.name}
              </span>
              <span className="food-entry-amount">{loggedAmountText(entry)}</span>
            </span>
            <span className="kcal">{formatKcal(kcal)}</span>
          </button>
          {ingredients && (
            <button
              type="button"
              className="food-entry-expand"
              aria-expanded={open}
              aria-controls={ingredientsId}
              aria-label={`Ingredienser i ${entry.name}`}
              onClick={() => {
                setOpen((o) => !o);
              }}
            >
              <span aria-hidden="true" className="chevron" />
            </button>
          )}
        </div>
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
      </div>
    </li>
  );
}
