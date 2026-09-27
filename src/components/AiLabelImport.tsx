import { useCallback, useRef, useState } from 'react';
import {
  foodLabelPrompt,
  parseFoodLabel,
  parseSupplementLabel,
  supplementLabelPrompt,
  type FoodLabel,
  type LabelResult,
  type SupplementLabel,
} from '../lib/aiLabel.ts';
import { copyText, shareText } from '../lib/clipboard.ts';
import { formatGrams, formatKcal, formatNutrient } from '../lib/format.ts';
import { nutrientInfo } from '../lib/nutrientUnits.ts';
import { formatDoseAmount } from '../lib/supplements.ts';
import { Disclosure } from './Disclosure.tsx';
import { ListRow } from './ListRow.tsx';
import { Toast } from './Toast.tsx';

type AiLabelImportProps = {
  /** Streckkoden (efter en skanning utan träff) – nämns i prompten och sparas. */
  ean?: string | undefined;
  onCancel: () => void;
} & (
  | { kind: 'tillskott'; onUse: (value: SupplementLabel) => void }
  | { kind: 'livsmedel'; onUse: (value: FoodLabel) => void }
);

type Checked = LabelResult<SupplementLabel> | LabelResult<FoodLabel> | null;

/**
 * "Lägg in med AI från etikett": kopiera eller dela prompten, fota näringsdeklarationen
 * i en AI-tjänst och klistra in svaret. Svaret valideras mot schemat och visas innan
 * värdena förs över till formuläret, där de kan rättas före sparning. Appen gör inga
 * anrop själv.
 */
export function AiLabelImport(props: AiLabelImportProps) {
  const { kind, ean, onCancel } = props;
  const prompt = kind === 'tillskott' ? supplementLabelPrompt(ean) : foodLabelPrompt(ean);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState<Checked>(null);
  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  async function copy() {
    const ok = await copyText(prompt, promptRef.current);
    setToast(
      ok ? 'Prompten är kopierad.' : 'Kunde inte kopiera – öppna prompten och kopiera själv.',
    );
  }

  async function share() {
    if ((await shareText(prompt)) === 'unavailable') await copy();
  }

  function check() {
    setChecked(kind === 'tillskott' ? parseSupplementLabel(answer) : parseFoodLabel(answer));
  }

  function use() {
    if (!checked?.ok) return;
    // Resultatet kommer från samma `kind` som tolkade det.
    if (props.kind === 'tillskott') props.onUse(checked.value as SupplementLabel);
    else props.onUse(checked.value as FoodLabel);
  }

  const what = kind === 'tillskott' ? 'tillskottets' : 'förpackningens';

  return (
    <section className="form ai-label" aria-labelledby="ai-label-title" data-testid="ai-label">
      <h2 className="card-title" id="ai-label-title">
        Lägg in med AI från etikett
      </h2>
      <ol className="steps">
        <li>Kopiera eller dela prompten till en AI-tjänst (t.ex. ChatGPT eller Claude).</li>
        <li>Bifoga en bild av {what} näringsdeklaration.</li>
        <li>Klistra in svaret nedan och granska värdena.</li>
      </ol>
      <div className="button-row">
        <button
          type="button"
          className={checked?.ok ? 'button button-secondary' : 'button'}
          onClick={() => void copy()}
        >
          Kopiera prompt
        </button>
        <button type="button" className="button button-secondary" onClick={() => void share()}>
          Dela
        </button>
      </div>
      <Disclosure summary="Visa prompten">
        <textarea
          ref={promptRef}
          className="input textarea ai-preview"
          readOnly
          rows={10}
          value={prompt}
          aria-label="Prompt"
          data-testid="ai-label-prompt"
        />
      </Disclosure>
      <label className="field">
        <span className="field-label">AI-tjänstens svar (JSON)</span>
        <textarea
          className="input textarea"
          rows={6}
          spellCheck={false}
          autoComplete="off"
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            setChecked(null);
          }}
        />
      </label>
      <button type="button" className="button button-secondary" onClick={check}>
        Granska svaret
      </button>

      {checked && !checked.ok && (
        <p className="form-error" role="alert" data-testid="ai-label-error">
          {checked.error}
        </p>
      )}
      {checked?.ok && (
        <div data-testid="ai-label-preview">
          <p className="field-label">Förhandsvisning</p>
          <ul className="list list-flush">
            {kind === 'tillskott' ? (
              <SupplementPreview value={checked.value as SupplementLabel} />
            ) : (
              <FoodPreview value={checked.value as FoodLabel} />
            )}
          </ul>
          {checked.warnings.map((w) => (
            <p key={w} className="form-note muted">
              {w}
            </p>
          ))}
          <p className="form-note muted">Kontrollera mot etiketten – du kan rätta i nästa steg.</p>
          <button type="button" className="button" onClick={use}>
            Använd värdena
          </button>
        </div>
      )}
      <button type="button" className="button button-ghost button-small" onClick={onCancel}>
        Avbryt
      </button>
      {toast && <Toast message={toast} onClose={closeToast} label="AI-import" testId="ai-toast" />}
    </section>
  );
}

function SupplementPreview({ value }: { value: SupplementLabel }) {
  return (
    <>
      <ListRow primary="Namn" value={value.name} wrapValue />
      <ListRow primary="Per dos" value={formatDoseAmount(value.form, value.amountPerDose)} />
      {value.nutrients.length === 0 ? (
        <ListRow primary="Näringsämnen" value="Inga" />
      ) : (
        value.nutrients.map((n) => (
          <ListRow
            key={n.key}
            primary={nutrientInfo(n.key).label}
            value={formatNutrient(n.amount, n.unit)}
          />
        ))
      )}
    </>
  );
}

function FoodPreview({ value }: { value: FoodLabel }) {
  return (
    <>
      <ListRow primary="Namn" value={value.name} wrapValue />
      <ListRow primary="Energi" secondary="Per 100 g" value={formatKcal(value.kcal)} />
      <ListRow primary="Protein" value={formatGrams(value.proteinG)} />
      <ListRow primary="Kolhydrater" value={formatGrams(value.carbsG)} />
      <ListRow primary="Fett" value={formatGrams(value.fatG)} />
    </>
  );
}
