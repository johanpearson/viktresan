import { useCallback, useId, useRef, useState } from 'react';
import {
  AI_OPTIONS,
  AI_SERVICES,
  aiServiceHome,
  aiServiceUrl,
  buildAiPrompt,
  optionLabel,
  type AiContext,
  type AiOption,
  type AiService,
  type AiSubject,
} from '../lib/aiPrompt.ts';
import { copyText, shareText } from '../lib/clipboard.ts';
import { useFeatures } from '../lib/features.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import { Toast } from './Toast.tsx';

interface AskAiProps {
  subject: AiSubject;
  context: AiContext;
}

/** Hints under kryssrutor vars uppgift saknas. */
function missingHint(id: AiOption, context: AiContext): string | null {
  if (id === 'preferences' && context.foodPreferences === null) {
    return 'Inte ifyllt – lägg till under Inställningar → Matpreferenser.';
  }
  if (id === 'glp1' && context.glp1 === null) return 'Ingen aktiv behandling inlagd.';
  return null;
}

/**
 * "Fråga AI": kryssrutor för vad som tas med, förhandsvisning av prompten och
 * åtgärder – dela (Androids delningsmeny), kopiera eller öppna i ChatGPT/Claude.
 * Appen gör inga egna anrop; valen sparas på enheten.
 */
export function AskAi({ subject, context }: AskAiProps) {
  const { prefs } = usePreferences();
  const { isEnabled } = useFeatures();
  const [toast, setToast] = useState<string | null>(null);
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const scope = subject.kind;

  const options = { ...prefs.aiOptions };
  // GLP-1 kan bara tas med när funktionen är påslagen.
  if (!isEnabled('glp1')) options.glp1 = false;
  const visible = AI_OPTIONS.filter(
    (o) => o.scopes.includes(scope) && (o.id !== 'glp1' || isEnabled('glp1')),
  );
  const prompt = buildAiPrompt(subject, context, options);

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  function toggle(id: AiOption, value: boolean) {
    void setPreference('aiOptions', { ...prefs.aiOptions, [id]: value });
  }

  async function copy() {
    const ok = await copyText(prompt, previewRef.current);
    setToast(
      ok ? 'Prompten är kopierad.' : 'Kunde inte kopiera – markera texten och kopiera själv.',
    );
  }

  async function share() {
    if ((await shareText(prompt)) === 'unavailable') await copy();
  }

  async function open(service: AiService, label: string) {
    const url = aiServiceUrl(service, prompt);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    // För lång för en länk: kopiera och öppna startsidan.
    const ok = await copyText(prompt, previewRef.current);
    setToast(
      ok
        ? `Prompten är för lång för en länk och är kopierad – klistra in den i ${label}.`
        : `Prompten är för lång för en länk – kopiera den och klistra in i ${label}.`,
    );
    window.open(aiServiceHome(service), '_blank', 'noopener,noreferrer');
  }

  const idPrefix = useId();

  return (
    <div className="ask-ai" data-testid="ask-ai">
      <fieldset className="switch-group">
        <legend className="field-label">Ta med</legend>
        <ul className="switch-list">
          {visible.map((o) => {
            const hint = missingHint(o.id, context);
            const id = `${idPrefix}-${o.id}`;
            return (
              <li key={o.id}>
                <label className="switch-row">
                  <span className="switch-text">
                    <span className="switch-label" id={`${id}-label`}>
                      {optionLabel(o, scope)}
                    </span>
                    {hint && (
                      <span className="switch-description" id={`${id}-hint`}>
                        {hint}
                      </span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="switch"
                    checked={options[o.id]}
                    aria-labelledby={`${id}-label`}
                    aria-describedby={hint ? `${id}-hint` : undefined}
                    onChange={(e) => {
                      toggle(o.id, e.target.checked);
                    }}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <label className="field">
        <span className="field-label">Förhandsvisning</span>
        <textarea
          ref={previewRef}
          className="input textarea ai-preview"
          readOnly
          rows={12}
          value={prompt}
          data-testid="ai-prompt"
        />
      </label>
      <p className="form-note muted">
        Appen skickar inget själv. Du väljer var prompten delas – AI-tjänsten får bara det som står
        ovan.
      </p>
      <div className="button-row">
        <button type="button" className="button" onClick={() => void share()}>
          Dela
        </button>
        <button type="button" className="button button-secondary" onClick={() => void copy()}>
          Kopiera
        </button>
      </div>
      <div className="button-row">
        {AI_SERVICES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="button button-secondary"
            onClick={() => void open(s.id, s.label)}
          >
            Öppna i {s.label}
          </button>
        ))}
      </div>
      {toast && <Toast message={toast} onClose={closeToast} label="Mat" testId="food-toast" />}
    </div>
  );
}
