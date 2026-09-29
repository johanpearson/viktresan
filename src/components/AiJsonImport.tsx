import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import type { LabelResult } from '../lib/aiLabel.ts';
import { copyText, shareText } from '../lib/clipboard.ts';
import { Disclosure } from './Disclosure.tsx';
import { Toast } from './Toast.tsx';

interface AiJsonImportProps<T> {
  title: string;
  /** Numrerade steg (`li`-innehåll). */
  steps: readonly ReactNode[];
  prompt: string;
  /** Validerar svaret mot schemat. */
  parse: (answer: string) => LabelResult<T>;
  /** Förhandsvisningen: `ListRow`-rader i en `list list-flush`. */
  preview: (value: T) => ReactNode;
  /** Dämpad rad under förhandsvisningen. */
  previewNote?: string;
  /** Primärknappen när svaret är granskat ("Använd värdena"). */
  useLabel: string;
  onUse: (value: T) => void;
  onCancel: () => void;
  /** Fält före prompten (t.ex. länk eller receptext). */
  children?: ReactNode;
  /** Bas för testid:n (`<testId>`, `-prompt`, `-error`, `-preview`). */
  testId: string;
}

/**
 * AI-flödena som svarar med JSON (etikett, recept): kopiera eller dela prompten till en
 * AI-tjänst, klistra in svaret, granska – svaret valideras mot schemat och förhandsvisas
 * innan det används. Appen gör inga anrop själv.
 */
export function AiJsonImport<T>({
  title,
  steps,
  prompt,
  parse,
  preview,
  previewNote,
  useLabel,
  onUse,
  onCancel,
  children,
  testId,
}: AiJsonImportProps<T>) {
  const titleId = useId();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState<LabelResult<T> | null>(null);
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

  return (
    <section className="form ai-label" aria-labelledby={titleId} data-testid={testId}>
      <h2 className="card-title" id={titleId}>
        {title}
      </h2>
      <ol className="steps">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      {children}
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
          data-testid={`${testId}-prompt`}
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
      <button
        type="button"
        className="button button-secondary"
        onClick={() => {
          setChecked(parse(answer));
        }}
      >
        Granska svaret
      </button>

      {checked && !checked.ok && (
        <p className="form-error" role="alert" data-testid={`${testId}-error`}>
          {checked.error}
        </p>
      )}
      {checked?.ok && (
        <div data-testid={`${testId}-preview`}>
          <p className="field-label">Förhandsvisning</p>
          <ul className="list list-flush">{preview(checked.value)}</ul>
          {checked.warnings.map((w) => (
            <p key={w} className="form-note muted">
              {w}
            </p>
          ))}
          {previewNote && <p className="form-note muted">{previewNote}</p>}
          <button
            type="button"
            className="button"
            onClick={() => {
              onUse(checked.value);
            }}
          >
            {useLabel}
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
