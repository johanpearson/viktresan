import { useState } from 'react';
import { isIncomplete, nutritionStatus, type NutritionStatusRow } from '../lib/foodNutrition.ts';
import { SOURCE_LABELS, type FoodItem } from '../lib/foodSearch.ts';
import { formatKcal } from '../lib/format.ts';
import { formatMacroG } from '../lib/fiber.ts';
import { ListRow } from './ListRow.tsx';

interface NutritionStatusProps {
  food: FoodItem;
  /** "Komplettera" (utelämnas = bara status, t.ex. vid redigering av en post). */
  onComplete?: () => void;
}

function valueText(row: NutritionStatusRow): string {
  if (row.value === null) return 'saknas';
  return row.unit === 'kcal' ? formatKcal(row.value) : formatMacroG(row.value);
}

/**
 * Livsmedlets näringsvärden per 100 g/ml (kcal, protein, kolhydrater, fett, fiber, socker)
 * med ursprung per värde: källan (Open Food Facts, Livsmedelsverket …) eller eget värde.
 * Saknas något står "saknas" och etiketten "Ofullständig näringsdata" syns; listan är då
 * utfälld.
 */
export function NutritionStatus({ food, onComplete }: NutritionStatusProps) {
  const incomplete = isIncomplete(food);
  const [open, setOpen] = useState(incomplete);
  const rows = nutritionStatus(food);
  const base = food.per100Unit ?? 'g';
  const missing = rows.filter((r) => r.value === null).map((r) => r.label.toLowerCase());
  return (
    <div className="nutrition-status" data-testid="nutrition-status">
      {incomplete && (
        <div className="nutrition-status-head">
          <p className="nutrition-status-note">
            <span className="tag tag-incomplete" data-testid="nutrition-incomplete">
              Ofullständig näringsdata
            </span>
            <span className="muted">Saknas: {missing.join(', ')}</span>
          </p>
          {onComplete && (
            <button
              type="button"
              className="button button-secondary button-small"
              data-testid="nutrition-complete"
              onClick={onComplete}
            >
              Komplettera
            </button>
          )}
        </div>
      )}
      <details
        className="plan-details"
        open={open}
        onToggle={(e) => {
          setOpen(e.currentTarget.open);
        }}
      >
        <summary>Näringsvärden per 100 {base}</summary>
        <ul className="list list-flush">
          {rows.map((row) => (
            <ListRow
              key={row.key}
              testId={`nutrition-${row.key}`}
              primary={row.label}
              secondary={
                row.origin === 'egen'
                  ? 'Eget värde'
                  : row.origin === 'kalla'
                    ? SOURCE_LABELS[food.source]
                    : undefined
              }
              value={
                <span
                  className={row.value === null ? 'muted' : 'num'}
                  data-origin={row.origin}
                  data-testid={`nutrition-${row.key}-value`}
                >
                  {valueText(row)}
                </span>
              }
            />
          ))}
        </ul>
        {!incomplete && onComplete && (
          <button
            type="button"
            className="button button-ghost button-small"
            data-testid="nutrition-complete"
            onClick={onComplete}
          >
            Rätta näringsvärden
          </button>
        )}
      </details>
    </div>
  );
}
