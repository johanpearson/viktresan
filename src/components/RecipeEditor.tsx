import { useMemo, useState, type SyntheticEvent } from 'react';
import { newId, putRecipe, type Recipe } from '../db/db.ts';
import { catalogFiberSource, scaleFiber } from '../lib/fiber.ts';
import { buildCatalog, storedItems } from '../lib/foodCatalog.ts';
import { filtersFrom, visibleFoods } from '../lib/foodFilters.ts';
import { buildIndex, type FoodItem } from '../lib/foodSearch.ts';
import { decimalInput, formatGrams, formatKcal, parseDecimal } from '../lib/format.ts';
import { saveMatches, type MatchMemory } from '../lib/matchMemory.ts';
import {
  editorTotals,
  newRow,
  openRows,
  rememberedMatches,
  rowAmount,
  rowsFromImport,
  rowsFromItems,
  rowsSummary,
  type EditorRow,
} from '../lib/recipeEditor.ts';
import {
  CONFIDENCE_LABELS,
  buildImportRows,
  hostOf,
  type ImportedRecipe,
} from '../lib/recipeImport.ts';
import { COOKED_WEIGHT_MAX_G, SERVINGS_MAX, recipeToSave } from '../lib/recipes.ts';
import { amountLabel, baseOf, formatBase, isGram } from '../lib/units.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { FoodPicker, type FoodSource } from './FoodPicker.tsx';
import { IngredientSheet } from './IngredientSheet.tsx';
import { ListRow } from './ListRow.tsx';
import { Macros } from './Macros.tsx';
import { Toast } from './Toast.tsx';

interface RecipeEditorProps {
  /** Receptet som redigeras, annars skapas ett nytt. */
  recipe: Recipe | null;
  /** Ett importerat recept att granska (receptimporten) och minnet av manuella matchningar. */
  imported?: { recipe: ImportedRecipe; memory: MatchMemory | null } | undefined;
  /** Livsmedel och egna enheter; ingredienser väljs med sök-sheeten. */
  source: FoodSource;
  onSaved: (recipe: Recipe) => void;
  onCancel: () => void;
  /** Avbryt-knappens text (importen: "Tillbaka" till AI-steget). */
  cancelLabel?: string;
  /**
   * "Laga en rätt" i sök-sheeten: en engångsrätt som loggas direkt. Rubriken och knappen
   * ändras och "Spara bland mina recept" är avbockat från början.
   */
  cookOnce?: boolean;
}

/** Tolkar ett valfritt tal i ett intervall: `null` = tomt, `undefined` = ogiltigt. */
function optionalNumber(text: string, min: number, max: number): number | null | undefined {
  if (text.trim() === '') return null;
  const value = parseDecimal(text);
  return value != null && value >= min && value <= max ? value : undefined;
}

const NO_FOODS: readonly FoodItem[] = [];

/** Papperskorg (ta bort raden). */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M9 4h6m-9 3h12m-1.5 0-.7 11.2a2 2 0 0 1-2 1.8H10.2a2 2 0 0 1-2-1.8L7.5 7m3 3.5v6m3-6v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Receptets redigeringsvy – samma för ett nytt, ett befintligt och ett importerat recept (och
 * "Laga en rätt"): namn, ingredienser som rader, utbyte (portioner och/eller tillagad vikt) och
 * totaler per portion som räknas om direkt. Tryck på en rad = `IngredientSheet` (originaltext,
 * matchning, mängd, enhet, räknas in); svep vänster eller papperskorgen tar bort med Ångra.
 * Salt, vatten och "efter smak" i en import föreslås som "räknas inte". En ändring påverkar bara
 * nya loggar – loggade portioner har kvar sina värden.
 */
export function RecipeEditor({
  recipe,
  imported,
  source,
  onSaved,
  onCancel,
  cancelLabel = 'Avbryt',
  cookOnce = false,
}: RecipeEditorProps) {
  const { foodData, livsmedel } = source;
  const importRecipe = imported?.recipe;
  const memory = imported?.memory ?? null;

  // Kandidater: egna livsmedel (även cachade Open Food Facts-träffar) och databasernas.
  const custom = useMemo(() => storedItems(foodData), [foodData]);
  const lvFoods = livsmedel?.foods ?? NO_FOODS;
  // Dolt i matsökningen föreslås inte som matchning – varken ur sökningen eller ur minnet.
  const hidden = useMemo(() => filtersFrom(foodData.hidden), [foodData.hidden]);
  const candidates = useMemo(
    () => visibleFoods([...custom, ...lvFoods], hidden),
    [custom, lvFoods, hidden],
  );
  const catalog = useMemo(() => buildCatalog(lvFoods, custom), [lvFoods, custom]);
  const customUnits = useMemo(
    () => new Map(foodData.foodUnits.map((u) => [u.foodId, u.units])),
    [foodData.foodUnits],
  );
  const fiberSource = useMemo(
    () => (livsmedel ? catalogFiberSource(catalog, []) : null),
    [livsmedel, catalog],
  );

  /** Raderna när underlaget finns: importens förslag (kräver databasen och minnet) eller receptets. */
  function initialRows(): EditorRow[] | null {
    if (importRecipe) {
      if (livsmedel === null || memory === null) return null;
      const matchCatalog = buildCatalog(candidates);
      const index = buildIndex(candidates);
      const rows = buildImportRows(importRecipe, {
        index,
        catalog: matchCatalog,
        memory,
        customUnits,
      });
      return rowsFromImport(rows, customUnits, newId);
    }
    return rowsFromItems(recipe?.items ?? [], catalog, customUnits, newId);
  }

  const [rows, setRows] = useState<EditorRow[] | null>(initialRows);
  // Importen väntar på databasen och minnet – raderna byggs en gång när de finns.
  if (rows === null && importRecipe && livsmedel !== null && memory !== null) {
    setRows(initialRows());
  }
  const [name, setName] = useState(recipe?.name ?? importRecipe?.name ?? '');
  const initialServings = recipe ? recipe.servings : (importRecipe?.servings ?? undefined);
  const [servings, setServings] = useState(
    initialServings != null ? decimalInput(initialServings) : '',
  );
  const [cooked, setCooked] = useState(
    recipe?.cookedWeightG !== undefined ? decimalInput(recipe.cookedWeightG) : '',
  );
  // Engångsrätter ligger under Arkiv i Egna; bocka i för att spara bland recepten.
  const [keep, setKeep] = useState(recipe ? recipe.oneOff !== true : !cookOnce);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useUndoToast();

  const list = rows ?? [];
  const servingsValue = optionalNumber(servings, 0.5, SERVINGS_MAX);
  const cookedValue = optionalNumber(cooked, 1, COOKED_WEIGHT_MAX_G);
  const totals = editorTotals(
    list,
    { servings: servingsValue ?? null, cookedWeightG: cookedValue ?? null },
    fiberSource,
  );
  const y = totals.yield;
  const sourceUrl = recipe?.sourceUrl ?? importRecipe?.sourceUrl;

  function changeRows(change: (prev: EditorRow[]) => EditorRow[]) {
    setError(null);
    setRows((prev) => change(prev ?? []));
  }

  function removeRow(row: EditorRow) {
    const index = list.findIndex((r) => r.key === row.key);
    changeRows((prev) => prev.filter((r) => r.key !== row.key));
    setEditing(null);
    toast.show(`Tog bort ${rowName(row)}.`, () => {
      changeRows((prev) => {
        if (prev.some((r) => r.key === row.key)) return prev;
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, row);
        return next;
      });
    });
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 120) {
      setError(cookOnce ? 'Ge rätten ett namn.' : 'Ge receptet ett namn.');
      return;
    }
    if (rows === null) return;
    if (!rows.some((r) => r.counted)) {
      setError('Lägg till minst en ingrediens.');
      return;
    }
    if (servingsValue === undefined) {
      setError(`Ange antal portioner (0,5–${String(SERVINGS_MAX)}) eller lämna tomt.`);
      return;
    }
    if (cookedValue === undefined) {
      setError('Ange tillagad vikt i gram (1–20 000) eller lämna tomt.');
      return;
    }
    if (servingsValue === null && cookedValue === null) {
      setError('Ange antal portioner, tillagad vikt eller båda.');
      return;
    }
    const open = openRows(rows);
    if (open.length > 0) {
      setError(
        `Välj livsmedel och mängd för ${open.map(rowName).join(', ')} – eller ta bort raden.`,
      );
      return;
    }
    setSaving(true);
    const saved = recipeToSave(recipe, {
      id: newId(),
      name: trimmed,
      items: totals.items,
      servings: servingsValue,
      cookedWeightG: cookedValue,
      sourceUrl,
      oneOff: !keep,
    });
    await putRecipe(saved);
    await saveMatches(rememberedMatches(rows));
    onSaved(saved);
  }

  const editingRow = editing !== null ? list.find((r) => r.key === editing) : undefined;

  return (
    <>
      <form
        className="card form"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        aria-labelledby="recipe-editor-title"
        data-testid="recipe-form"
      >
        <h2 className="card-title" id="recipe-editor-title">
          {recipe
            ? 'Redigera recept'
            : cookOnce
              ? 'Laga en rätt'
              : importRecipe
                ? 'Granska receptet'
                : 'Nytt recept'}
        </h2>
        <label className="field">
          <span className="field-label">{cookOnce ? 'Rättens namn' : 'Receptets namn'}</span>
          <input
            className="input"
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </label>
        {sourceUrl !== undefined && (
          <p className="form-note" data-testid="recipe-source">
            Källa:{' '}
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
              {hostOf(sourceUrl)}
            </a>
          </p>
        )}
        <fieldset className="fieldset">
          <legend className="field-label">Utbyte</legend>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Antal portioner</span>
              <input
                className="input"
                inputMode="decimal"
                autoComplete="off"
                value={servings}
                onChange={(e) => {
                  setServings(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Tillagad vikt (g)</span>
              <input
                className="input"
                inputMode="decimal"
                autoComplete="off"
                value={cooked}
                onChange={(e) => {
                  setCooked(e.target.value);
                  setError(null);
                }}
              />
            </label>
          </div>
          <p className="form-note muted">
            Ange minst ett. Väg gärna grytan efter tillagning – då blir gram rätt när du loggar.
          </p>
        </fieldset>
        <section className="recipe-ingredients" aria-labelledby="recipe-ingredients-title">
          <h3 className="subheading" id="recipe-ingredients-title">
            Ingredienser
          </h3>
          {rows === null ? (
            <p className="muted" role="status">
              Laddar livsmedelsdatabasen …
            </p>
          ) : (
            <>
              {importRecipe && (
                <p className="form-note muted" data-testid="import-summary">
                  {rowsSummary(rows)}
                </p>
              )}
              {rows.length > 0 && (
                <ul className="list" aria-label="Ingredienser">
                  {rows.map((row) => (
                    <IngredientRow
                      key={row.key}
                      row={row}
                      onOpen={() => {
                        toast.close();
                        setEditing(row.key);
                      }}
                      onRemove={() => {
                        removeRow(row);
                      }}
                    />
                  ))}
                </ul>
              )}
              <p className="form-note" data-testid="meal-total">
                {totals.items.length === 0
                  ? 'Inga ingredienser ännu.'
                  : `Ingredienser ${formatGrams(Math.round(y.rawG))} · ${formatKcal(totals.total.kcal)}`}
              </p>
            </>
          )}
          <button
            type="button"
            className="button button-secondary"
            disabled={rows === null}
            onClick={() => {
              toast.close();
              setAdding(true);
            }}
          >
            Lägg till ingrediens
          </button>
        </section>
        {totals.items.length > 0 && (servingsValue != null || cookedValue != null) && (
          <ul className="list list-flush" data-testid="recipe-nutrition">
            {totals.perPortion && y.portionG !== null && (
              <ListRow
                testId="recipe-per-portion"
                primary="Per portion"
                secondary={
                  <Macros
                    lead={`≈ ${formatGrams(Math.round(y.portionG))}`}
                    nutrients={totals.perPortion}
                    fiber={totals.fiberPerPortion}
                  />
                }
                value={<span className="kcal">{formatKcal(totals.perPortion.kcal)}</span>}
              />
            )}
            <ListRow
              testId="recipe-per-100"
              primary="Per 100 g"
              secondary={
                <Macros
                  lead={y.cooked ? 'Tillagad vikt' : 'Ingrediensernas vikt'}
                  nutrients={y.per100}
                  fiber={y.yieldG > 0 ? scaleFiber(totals.fiber, 100 / y.yieldG) : null}
                />
              }
              value={<span className="kcal">{formatKcal(y.per100.kcal)}</span>}
            />
            <ListRow
              testId="recipe-total"
              primary="Hela receptet"
              secondary={
                <Macros
                  lead={formatGrams(Math.round(y.yieldG))}
                  nutrients={totals.total}
                  fiber={totals.fiber}
                />
              }
              value={<span className="kcal">{formatKcal(totals.total.kcal)}</span>}
            />
          </ul>
        )}
        <label className="switch-row" data-testid="recipe-keep">
          <span className="switch-text">
            <span className="switch-label">Spara bland mina recept</span>
            <span className="switch-description" id="recipe-keep-desc">
              {keep
                ? 'Visas under Recept i Egna och under Måltider när du loggar.'
                : 'Lagas en gång: hamnar under Arkiv i Egna och finns kvar i sökningen.'}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={keep}
            aria-describedby="recipe-keep-desc"
            onChange={(e) => {
              setKeep(e.target.checked);
            }}
          />
        </label>
        {recipe && (
          <p className="form-note muted">
            Ändringar gäller nya loggar – det du redan loggat behåller sina värden.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="button" disabled={rows === null}>
            {cookOnce ? 'Fortsätt till loggning' : 'Spara recept'}
          </button>
          <button type="button" className="button button-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </form>
      {/* Utanför formuläret: panelerna har egna formulär. */}
      {editingRow && (
        <IngredientSheet
          key={editingRow.key}
          row={editingRow}
          source={source}
          onSave={(next) => {
            changeRows((prev) => prev.map((r) => (r.key === next.key ? next : r)));
            setEditing(null);
          }}
          onRemove={() => {
            removeRow(editingRow);
          }}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      {adding && (
        <FoodPicker
          source={source}
          focusSearch
          mode={{
            kind: 'ingredient',
            onAdd: (item, value, units) => {
              changeRows((prev) => [...prev, newRow(newId(), item, value, units)]);
              setAdding(false);
            },
          }}
          onClose={() => {
            setAdding(false);
          }}
        />
      )}
      {toast.toast && (
        <Toast
          label="Recept"
          testId="recipe-toast"
          message={toast.toast.message}
          onUndo={toast.onUndo}
          onClose={toast.close}
        />
      )}
    </>
  );
}

/** Radens namn: livsmedlet, annars originaltexten. */
function rowName(row: EditorRow): string {
  return row.original ?? row.food?.name ?? 'ingrediensen';
}

function IngredientRow({
  row,
  onOpen,
  onRemove,
}: {
  row: EditorRow;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { food, counted, confidence } = row;
  const parsed = rowAmount(row);
  const grams = parsed?.ok ? parsed.value.grams : null;
  const kcal = food && grams !== null ? (food.per100.kcal * grams) / 100 : null;
  const amountText =
    food && parsed?.ok
      ? isGram(parsed.value.unit)
        ? formatBase(parsed.value.grams, baseOf(food))
        : `${amountLabel(parsed.value.amount, parsed.value.unit)} ≈ ${formatBase(parsed.value.grams, baseOf(food))}`
      : 'mängd saknas';
  // Importerade rader visar originaltexten först och matchningen under.
  const primary = row.original ?? food?.name ?? '';
  const match = food
    ? row.original !== undefined
      ? `${food.name} · ${amountText}`
      : amountText
    : 'Ingen träff – tryck för att välja';
  const tag = !counted ? (
    <span className="tag tag-uncounted" data-testid="uncounted-tag">
      Räknas inte
    </span>
  ) : (
    confidence !== null && (
      <span className={`tag tag-confidence tag-confidence-${food ? confidence : 'ingen'}`}>
        {CONFIDENCE_LABELS[food ? confidence : 'ingen']}
      </span>
    )
  );
  return (
    <ListRow
      testId="recipe-ingredient"
      className={counted ? 'recipe-ingredient' : 'recipe-ingredient recipe-ingredient-uncounted'}
      primary={primary}
      secondary={
        <>
          {counted ? match : (food?.name ?? 'Inte med i näringen')} {tag}
        </>
      }
      value={
        counted ? <span className="kcal">{kcal !== null ? formatKcal(kcal) : '–'}</span> : undefined
      }
      onClick={onOpen}
      swipeLeft={{ label: 'Ta bort', onSwipe: onRemove }}
      trailing={
        <button
          type="button"
          className="icon-button row-remove"
          aria-label={`Ta bort ingrediensen ${row.food?.name ?? primary}`}
          onClick={onRemove}
        >
          <TrashIcon />
        </button>
      }
    />
  );
}
