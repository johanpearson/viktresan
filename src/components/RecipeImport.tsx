import { useEffect, useState } from 'react';
import type { Recipe } from '../db/db.ts';
import { decimalInput } from '../lib/format.ts';
import { EMPTY_MEMORY, loadMatchMemory, type MatchMemory } from '../lib/matchMemory.ts';
import {
  hostOf,
  parseRecipeImport,
  recipeImportPrompt,
  recipeInput,
  type ImportedRecipe,
} from '../lib/recipeImport.ts';
import { AiJsonImport } from './AiJsonImport.tsx';
import type { FoodSource } from './FoodPicker.tsx';
import { ListRow } from './ListRow.tsx';
import { RecipeImportReview } from './RecipeImportReview.tsx';

interface RecipeImportProps {
  source: FoodSource;
  /** Förifylld länk eller text (delad via delningsmenyn). */
  initialInput: string;
  onSaved: (recipe: Recipe) => void;
  onCancel: () => void;
}

const STEPS = [
  'Klistra in en länk eller receptext – eller lämna tomt och bifoga en bild av receptet i AI-tjänsten.',
  'Kopiera eller dela prompten till en AI-tjänst (t.ex. ChatGPT eller Claude).',
  'Klistra in svaret nedan och granska ingredienserna.',
];

/**
 * "Importera recept": länk eller receptext → prompt till en AI-tjänst → inklistrat
 * JSON-svar (valideras) → granskning av ingrediensmatchningarna → sparat recept. Appen
 * hämtar aldrig receptsidan själv – det gör AI-tjänsten.
 */
export function RecipeImport({ source, initialInput, onSaved, onCancel }: RecipeImportProps) {
  const [input, setInput] = useState(initialInput);
  const [imported, setImported] = useState<ImportedRecipe | null>(null);
  const [memory, setMemory] = useState<MatchMemory | null>(null);

  useEffect(() => {
    let alive = true;
    void loadMatchMemory().then((m) => {
      if (alive) setMemory(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (imported) {
    return (
      <RecipeImportReview
        recipe={imported}
        source={source}
        memory={memory ?? EMPTY_MEMORY}
        onSaved={onSaved}
        onBack={() => {
          setImported(null);
        }}
      />
    );
  }

  const parsed = recipeInput(input);
  const note =
    parsed.kind === 'url'
      ? `Länk till ${hostOf(parsed.url)} – AI-tjänsten läser receptet där.`
      : parsed.kind === 'text'
        ? 'Receptexten tas med i prompten.'
        : 'Tomt: bifoga en bild av receptet i AI-tjänsten.';

  return (
    <AiJsonImport
      title="Läs in receptet med AI"
      steps={STEPS}
      prompt={recipeImportPrompt(parsed)}
      parse={parseRecipeImport}
      preview={(value) => <RecipePreview value={value} />}
      previewNote="Nästa steg: ingredienserna matchas mot livsmedel som du granskar."
      useLabel="Granska ingredienser"
      onUse={setImported}
      onCancel={onCancel}
      testId="recipe-ai"
    >
      <label className="field">
        <span className="field-label">Länk eller receptext</span>
        <textarea
          className="input textarea"
          rows={3}
          autoComplete="off"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          data-testid="recipe-input"
        />
        <span className="form-note muted" data-testid="recipe-input-note">
          {note}
        </span>
      </label>
    </AiJsonImport>
  );
}

function RecipePreview({ value }: { value: ImportedRecipe }) {
  return (
    <>
      <ListRow primary="Namn" value={value.name} wrapValue />
      <ListRow
        primary="Portioner"
        value={value.servings !== null ? decimalInput(value.servings) : 'Saknas'}
      />
      <ListRow primary="Ingredienser" value={String(value.ingredients.length)} />
      {value.sourceUrl !== undefined && (
        <ListRow primary="Källa" value={hostOf(value.sourceUrl)} wrapValue />
      )}
    </>
  );
}
