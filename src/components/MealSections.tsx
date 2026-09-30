import type { FoodLogEntry, SavedMeal } from '../db/db.ts';
import { fiberSum, type FiberSource } from '../lib/fiber.ts';
import { entryCountText, loggedMealIngredients, mealSections } from '../lib/foodDay.ts';
import { formatKcal } from '../lib/format.ts';
import type { MealSlot } from '../lib/nutrition.ts';
import { FoodEntryRow } from './FoodEntryRow.tsx';
import { Macros } from './Macros.tsx';
import { SectionAccordion } from './SectionAccordion.tsx';

interface MealSectionsProps {
  entries: readonly FoodLogEntry[];
  /** Sparade måltider – för att visa ingredienserna i en loggad måltid. */
  meals: readonly SavedMeal[];
  /** Utfällda måltider (styrs av Mat → Dag). */
  open: ReadonlySet<MealSlot>;
  /** Favoritmarkerade livsmedel (id). */
  favoriteIds: ReadonlySet<string>;
  /** Fiberdata för posterna, `null` medan den laddas (då visas ingen fiber). */
  fiberSource?: FiberSource | null;
  onToggle: (slot: MealSlot) => void;
  onAdd: (slot: MealSlot) => void;
  /** Menyn (⋯) för en måltid: föreslå, spara som egen måltid, analysera. */
  onMenu: (slot: MealSlot) => void;
  /** Visa ⋯ även för tomma måltider (idag: menyn har Föreslå). */
  menuAlways?: boolean;
  onEdit: (entry: FoodLogEntry) => void;
  onDelete: (entry: FoodLogEntry) => void;
  onToggleFavorite: (entry: FoodLogEntry) => void;
}

/**
 * Dagens mat per måltid som `SectionAccordion`: namn, kcal och antal poster i
 * rubriken, makron och fiber under, ⋯ för fler val och + för att lägga till. Tomma måltider är en smal
 * rad med + (och ⋯ med Föreslå idag).
 */
export function MealSections({
  entries,
  meals,
  open,
  favoriteIds,
  fiberSource = null,
  menuAlways = false,
  onToggle,
  onAdd,
  onMenu,
  onEdit,
  onDelete,
  onToggleFavorite,
}: MealSectionsProps) {
  return (
    <section className="meal-sections" aria-labelledby="day-log-title">
      <h2 className="visually-hidden" id="day-log-title">
        Dagens mat
      </h2>
      {mealSections(entries).map((section) => {
        const name = section.label.toLowerCase();
        return (
          <SectionAccordion
            key={section.slot}
            id={`meal-${section.slot}`}
            testId={`meal-${section.slot}`}
            title={section.label}
            meta={entryCountText(section.count)}
            value={
              <span className="kcal" data-testid="meal-kcal">
                {formatKcal(section.totals.kcal)}
              </span>
            }
            detail={
              <span data-testid="meal-macros">
                <Macros
                  nutrients={section.totals}
                  fiber={fiberSource ? fiberSum(section.entries, fiberSource) : undefined}
                />
              </span>
            }
            empty={section.count === 0}
            expanded={open.has(section.slot)}
            onToggle={() => {
              onToggle(section.slot);
            }}
            actions={
              <>
                {(section.count > 0 || menuAlways) && (
                  <button
                    type="button"
                    className="icon-button accordion-action"
                    aria-label={`Fler val för ${name}`}
                    aria-haspopup="dialog"
                    onClick={() => {
                      onMenu(section.slot);
                    }}
                  >
                    <span aria-hidden="true">⋯</span>
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button accordion-action accordion-add"
                  aria-label={`Lägg till i ${name}`}
                  onClick={() => {
                    onAdd(section.slot);
                  }}
                >
                  <span aria-hidden="true">+</span>
                </button>
              </>
            }
          >
            <ul className="list">
              {section.entries.map((entry) => (
                <FoodEntryRow
                  key={entry.id}
                  entry={entry}
                  ingredients={loggedMealIngredients(entry, meals)}
                  favorite={favoriteIds.has(entry.foodId)}
                  fiber={fiberSource ? fiberSum([entry], fiberSource) : undefined}
                  onEdit={() => {
                    onEdit(entry);
                  }}
                  onDelete={() => {
                    onDelete(entry);
                  }}
                  onToggleFavorite={() => {
                    onToggleFavorite(entry);
                  }}
                />
              ))}
            </ul>
          </SectionAccordion>
        );
      })}
    </section>
  );
}
