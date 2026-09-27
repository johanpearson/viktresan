import type { FoodLogEntry, SavedMeal } from '../db/db.ts';
import { entryCountText, loggedMealIngredients, mealSections } from '../lib/foodDay.ts';
import { formatKcal } from '../lib/format.ts';
import type { MealSlot } from '../lib/nutrition.ts';
import { FoodEntryRow } from './FoodEntryRow.tsx';

interface MealSectionsProps {
  entries: readonly FoodLogEntry[];
  /** Sparade måltider – för att visa ingredienserna i en loggad måltid. */
  meals: readonly SavedMeal[];
  /** Utfällda måltider (styrs av Mat → Dag). */
  open: ReadonlySet<MealSlot>;
  onToggle: (slot: MealSlot) => void;
  onAdd: (slot: MealSlot) => void;
  onEdit: (entry: FoodLogEntry) => void;
  onDelete: (entry: FoodLogEntry) => void;
}

/**
 * Dagens mat per måltid som hopfällbara kort: namn, kcal och antal poster i
 * rubriken, + för att lägga till. Tomma måltider är en smal rad med bara +.
 */
export function MealSections({
  entries,
  meals,
  open,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
}: MealSectionsProps) {
  return (
    <section className="meal-sections" aria-labelledby="day-log-title">
      <h2 className="visually-hidden" id="day-log-title">
        Dagens mat
      </h2>
      {mealSections(entries).map((section) => {
        const expanded = section.count > 0 && open.has(section.slot);
        const listId = `meal-list-${section.slot}`;
        return (
          <div
            key={section.slot}
            className={section.count === 0 ? 'meal-card meal-card-empty' : 'meal-card'}
            data-testid={`meal-${section.slot}`}
            data-expanded={expanded ? 'true' : 'false'}
          >
            <div className="meal-card-header">
              {section.count === 0 ? (
                <h3 className="meal-heading meal-heading-empty">{section.label}</h3>
              ) : (
                <h3 className="meal-heading">
                  <button
                    type="button"
                    className="meal-toggle"
                    aria-expanded={expanded}
                    aria-controls={listId}
                    onClick={() => {
                      onToggle(section.slot);
                    }}
                  >
                    <span className="meal-name">{section.label}</span>
                    <span className="meal-count">{entryCountText(section.count)}</span>
                    <span className="kcal meal-kcal" data-testid="meal-kcal">
                      {formatKcal(section.totals.kcal)}
                    </span>
                    <span aria-hidden="true" className="chevron" />
                  </button>
                </h3>
              )}
              <button
                type="button"
                className="meal-add"
                aria-label={`Lägg till i ${section.label.toLowerCase()}`}
                onClick={() => {
                  onAdd(section.slot);
                }}
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>
            {expanded && (
              <ul className="food-entries" id={listId}>
                {section.entries.map((entry) => (
                  <FoodEntryRow
                    key={entry.id}
                    entry={entry}
                    ingredients={loggedMealIngredients(entry, meals)}
                    onEdit={() => {
                      onEdit(entry);
                    }}
                    onDelete={() => {
                      onDelete(entry);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
