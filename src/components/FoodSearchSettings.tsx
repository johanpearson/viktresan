import { useEffect, useMemo, useState } from 'react';
import type { FoodCategory } from '../data/foodCategories.ts';
import {
  deleteHiddenFoods,
  hiddenKey,
  listFoodLog,
  listFoods,
  listHiddenFoods,
  putHiddenFoods,
  type HiddenFood,
} from '../db/db.ts';
import { buildCatalog, sourceOf, storedItems } from '../lib/foodCatalog.ts';
import {
  categoryCounts,
  filtersFrom,
  hiddenCategoryEntry,
  hiddenSourceEntry,
  suggestedCategories,
  DATABASE_SOURCES,
  type CategoryCount,
  type DatabaseSource,
} from '../lib/foodFilters.ts';
import { normalize, SOURCE_LABELS } from '../lib/foodSearch.ts';
import { formatInt } from '../lib/format.ts';
import { loadLivsmedel } from '../lib/livsmedel.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { Card } from './Card.tsx';
import { ListRow } from './ListRow.tsx';
import { Toast } from './Toast.tsx';

const SOURCE_DESCRIPTIONS: Record<DatabaseSource, string> = {
  livsmedelsverket: 'Svenska livsmedelsdatabasen',
  fineli: 'Finska livsmedelsdatabasen (THL), på svenska',
  openfoodfacts: 'Produkter du skannat',
};

/** "Godis, Glass och Kryddor". */
function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} och ${labels[labels.length - 1] ?? ''}`;
}

function categoryDescription(c: CategoryCount): string {
  const foods = `${formatInt(c.foods)} livsmedel`;
  return c.logged === 0
    ? `${foods} · aldrig loggad`
    : `${foods} · loggad ${formatInt(c.logged)} ggr`;
}

/**
 * Inställningar → Matsökning: källor, dolda kategorier (med förslag på aldrig loggade) och dolda
 * livsmedel med Återställ. Påverkar bara sökning och snabbval – aldrig loggen eller summeringar.
 */
export function FoodSearchSettings() {
  const [hidden, setHidden] = useState<HiddenFood[] | null>(null);
  const [counts, setCounts] = useState<CategoryCount[] | null>(null);
  const [query, setQuery] = useState('');
  const toast = useUndoToast();

  useEffect(() => {
    let active = true;
    void listHiddenFoods().then((result) => {
      if (active) setHidden(result);
    });
    // Kategorierna räknas ur databaserna och cachade produkter, loggade ur matloggen.
    Promise.all([loadLivsmedel(), listFoods(), listFoodLog()])
      .then(([livsmedel, foods, log]) => {
        const off = storedItems({
          foods: foods.filter((f) => f.source === 'openfoodfacts'),
          overrides: [],
        });
        const all = [...livsmedel.foods, ...off];
        if (active) setCounts(categoryCounts(all, log, buildCatalog(all)));
      })
      .catch(() => {
        if (active) setCounts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const filters = useMemo(() => filtersFrom(hidden ?? []), [hidden]);
  const hiddenFoods = (hidden ?? []).filter((h) => h.kind === 'livsmedel');
  const q = normalize(query);
  const shownFoods =
    q === '' ? hiddenFoods : hiddenFoods.filter((h) => normalize(h.name ?? h.value).includes(q));
  const suggestions = counts ? suggestedCategories(counts, filters.categories) : [];

  async function reload() {
    setHidden(await listHiddenFoods());
  }

  // Brytarna ändras direkt (optimistiskt) och läses sedan om ur databasen.
  async function hide(entries: readonly HiddenFood[]) {
    const keys = new Set(entries.map((e) => e.key));
    setHidden((prev) => [...(prev ?? []).filter((h) => !keys.has(h.key)), ...entries]);
    await putHiddenFoods(entries);
    await reload();
  }

  async function show(keys: readonly string[]) {
    setHidden((prev) => (prev ?? []).filter((h) => !keys.includes(h.key)));
    await deleteHiddenFoods(keys);
    await reload();
  }

  async function restore(entry: HiddenFood) {
    await show([entry.key]);
    toast.show(`${entry.name ?? 'Livsmedlet'} visas igen i sökningen.`, async () => {
      await hide([entry]);
    });
  }

  function setCategoryShown(category: FoodCategory, shown: boolean) {
    if (shown) void show([hiddenKey('kategori', category)]);
    else void hide([hiddenCategoryEntry(category)]);
  }

  return (
    <>
      <p className="form-note">
        Mindre brus i sökningen. Det du döljer finns kvar i loggen, historiken och rapporten.
      </p>
      <Card title="Källor">
        <ul className="switch-list">
          {DATABASE_SOURCES.map((source) => (
            <li key={source}>
              <label className="switch-row">
                <span className="switch-text">
                  <span className="switch-label">{SOURCE_LABELS[source]}</span>
                  <span className="switch-description" id={`search-source-${source}-desc`}>
                    {SOURCE_DESCRIPTIONS[source]}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={!filters.sources.has(source)}
                  disabled={hidden === null}
                  aria-describedby={`search-source-${source}-desc`}
                  data-testid={`search-source-${source}`}
                  onChange={(e) => {
                    if (e.target.checked) void show([hiddenKey('kalla', source)]);
                    else void hide([hiddenSourceEntry(source)]);
                  }}
                />
              </label>
            </li>
          ))}
        </ul>
        <p className="form-note">Egna livsmedel, måltider och recept visas alltid.</p>
      </Card>
      <Card title="Kategorier">
        {counts === null ? (
          <p className="muted" role="status">
            Läser livsmedelsdatabasen …
          </p>
        ) : (
          <>
            {suggestions.length > 0 && (
              <div className="search-suggestions" data-testid="category-suggestions">
                <p className="form-note">
                  Förslag – aldrig loggat: {joinLabels(suggestions.map((c) => c.label))}.
                </p>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => void hide(suggestions.map((c) => hiddenCategoryEntry(c.category)))}
                >
                  Dölj förslagen
                </button>
              </div>
            )}
            <p className="form-note">Stäng av en kategori för att dölja den i sökningen.</p>
            <ul className="switch-list">
              {counts.map((c) => (
                <li key={c.category}>
                  <label className="switch-row">
                    <span className="switch-text">
                      <span className="switch-label">{c.label}</span>
                      <span
                        className="switch-description"
                        id={`search-category-${c.category}-desc`}
                      >
                        {categoryDescription(c)}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="switch"
                      checked={!filters.categories.has(c.category)}
                      disabled={hidden === null}
                      aria-describedby={`search-category-${c.category}-desc`}
                      data-testid={`search-category-${c.category}`}
                      onChange={(e) => {
                        setCategoryShown(c.category, e.target.checked);
                      }}
                    />
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card title="Dolda livsmedel" testId="hidden-foods">
        {hiddenFoods.length === 0 ? (
          <p className="muted">
            Inga dolda livsmedel. Svep vänster eller håll fingret på en sökträff för att dölja den.
          </p>
        ) : (
          <>
            <label className="search-field">
              <span className="visually-hidden">Sök bland dolda livsmedel</span>
              <span aria-hidden="true" className="search-icon" />
              <input
                className="input"
                type="search"
                placeholder="Sök bland dolda"
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
              />
            </label>
            {shownFoods.length === 0 ? (
              <p className="muted">Inga träffar.</p>
            ) : (
              <ul className="list">
                {shownFoods.map((h) => (
                  <ListRow
                    key={h.key}
                    testId="hidden-food"
                    primary={h.name ?? h.value}
                    secondary={SOURCE_LABELS[sourceOf(h.value)]}
                    trailing={
                      <button
                        type="button"
                        className="button button-ghost button-small hidden-restore"
                        aria-label={`Återställ ${h.name ?? h.value}`}
                        onClick={() => void restore(h)}
                      >
                        Återställ
                      </button>
                    }
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
      {toast.toast && (
        <Toast
          label="Matsökning"
          testId="search-settings-toast"
          message={toast.toast.message}
          onUndo={toast.onUndo}
          onClose={toast.close}
        />
      )}
    </>
  );
}
