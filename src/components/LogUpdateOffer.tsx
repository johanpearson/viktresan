import { useEffect, useState } from 'react';
import { listFoodLog, putFoodLogEntries, type FoodLogEntry } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import {
  UPDATE_SCOPES,
  logEntriesToUpdate,
  updatedLogEntries,
  type UpdateScope,
} from '../lib/foodNutrition.ts';
import type { FoodItem } from '../lib/foodSearch.ts';
import { formatInt } from '../lib/format.ts';

interface LogUpdateOfferProps {
  /** Livsmedlet med de nya värdena. */
  food: FoodItem;
  /** Uppdaterade (antal poster) eller "Inte nu" (0). */
  onDone: (updated: number) => void;
}

/** Skriver posterna med de nya värdena (utanför renderingen: tidsstämpeln). */
async function saveUpdated(entries: readonly FoodLogEntry[], food: FoodItem): Promise<void> {
  await putFoodLogEntries(updatedLogEntries(entries, food.per100, Date.now()));
}

function posts(n: number): string {
  return `${formatInt(n)} ${n === 1 ? 'post' : 'poster'}`;
}

/**
 * Efter en komplettering: erbjud att uppdatera tidigare loggposter av samma vara med de nya
 * kcal- och makrovärdena – bara idag, senaste 7 dagarna eller alla. Visas bara när någon
 * post har andra värden. Mängderna ändras inte.
 */
export function LogUpdateOffer({ food, onDone }: LogUpdateOfferProps) {
  const [log, setLog] = useState<FoodLogEntry[] | null>(null);
  const [scope, setScope] = useState<UpdateScope | null>(null);
  const today = todayIso();

  useEffect(() => {
    let active = true;
    void listFoodLog().then((entries) => {
      if (active) setLog(entries);
    });
    return () => {
      active = false;
    };
  }, []);

  if (log === null) return null;
  const counts = new Map(
    UPDATE_SCOPES.map((s) => [
      s.id,
      logEntriesToUpdate(log, food.id, food.per100, s.id, today).length,
    ]),
  );
  if ((counts.get('alla') ?? 0) === 0) return null;
  const chosen = scope ?? UPDATE_SCOPES.find((s) => (counts.get(s.id) ?? 0) > 0)?.id ?? 'alla';
  const count = counts.get(chosen) ?? 0;

  async function update() {
    const entries = logEntriesToUpdate(log ?? [], food.id, food.per100, chosen, today);
    await saveUpdated(entries, food);
    onDone(entries.length);
  }

  return (
    <section
      className="card update-offer"
      aria-labelledby="update-offer-title"
      data-testid="log-update-offer"
    >
      <h2 className="card-title" id="update-offer-title">
        Uppdatera tidigare loggar?
      </h2>
      <p className="form-note muted">
        Du har loggat {food.name} med de gamla värdena. Välj vilka poster som ska få de nya kcal-
        och makrovärdena – mängderna ändras inte. Fiber och socker följer alltid livsmedlet.
      </p>
      <div className="chip-grid" role="group" aria-label="Vilka loggposter">
        {UPDATE_SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="chip chip-small"
            aria-pressed={s.id === chosen}
            data-testid={`update-scope-${s.id}`}
            onClick={() => {
              setScope(s.id);
            }}
          >
            {s.label} ({formatInt(counts.get(s.id) ?? 0)})
          </button>
        ))}
      </div>
      <div className="button-row">
        <button
          type="button"
          className="button button-secondary"
          disabled={count === 0}
          data-testid="update-log"
          onClick={() => void update()}
        >
          Uppdatera {posts(count)}
        </button>
        <button
          type="button"
          className="button button-ghost"
          onClick={() => {
            onDone(0);
          }}
        >
          Inte nu
        </button>
      </div>
    </section>
  );
}
