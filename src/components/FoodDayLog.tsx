import { useState } from 'react';
import { deleteFoodLog, type FoodLogEntry } from '../db/db.ts';
import { decimalInput, formatGrams, formatKcal } from '../lib/format.ts';
import { MEAL_SLOTS, scaleNutrients, totalOf } from '../lib/nutrition.ts';

interface FoodDayLogProps {
  entries: readonly FoodLogEntry[];
  onEdit: (entry: FoodLogEntry) => void;
  onDeleted: () => void;
}

function amountText(entry: FoodLogEntry): string {
  if (entry.portionCount == null) return formatGrams(entry.grams);
  return `${decimalInput(entry.portionCount)} ${entry.portionName ?? 'portion'} (${formatGrams(entry.grams)})`;
}

/** Dagens loggade mat, grupperad per måltid, med redigering och borttagning. */
export function FoodDayLog({ entries, onEdit, onDeleted }: FoodDayLogProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    await deleteFoodLog(id);
    setConfirmId(null);
    onDeleted();
  }

  return (
    <section className="card" aria-labelledby="day-log-title">
      <h2 className="card-title" id="day-log-title">
        Dagens mat
      </h2>
      {entries.length === 0 ? (
        <p className="muted">Inget loggat den här dagen.</p>
      ) : (
        MEAL_SLOTS.map((slot) => {
          const inSlot = entries.filter((e) => e.meal === slot.id);
          if (inSlot.length === 0) return null;
          return (
            <div key={slot.id} className="meal-group" data-testid={`meal-${slot.id}`}>
              <h3 className="meal-title">
                <span>{slot.label}</span>
                <span className="meal-total">{formatKcal(totalOf(inSlot).kcal)}</span>
              </h3>
              <ul className="entry-list">
                {inSlot.map((e) => (
                  <li key={e.id} className="entry" data-testid="food-entry">
                    <div className="entry-main">
                      <span className="entry-date">{e.name}</span>
                      <span className="entry-weight">
                        {formatKcal(scaleNutrients(e.per100, e.grams).kcal)}
                      </span>
                    </div>
                    <p className="entry-extra">{amountText(e)}</p>
                    <div className="entry-actions">
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        aria-label={`Redigera ${e.name}`}
                        onClick={() => {
                          setConfirmId(null);
                          onEdit(e);
                        }}
                      >
                        Redigera
                      </button>
                      <button
                        type="button"
                        className="button button-danger button-small"
                        aria-label={
                          confirmId === e.id
                            ? `Bekräfta borttagning av ${e.name}`
                            : `Ta bort ${e.name}`
                        }
                        onClick={() => void handleDelete(e.id)}
                      >
                        {confirmId === e.id ? 'Bekräfta' : 'Ta bort'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}
