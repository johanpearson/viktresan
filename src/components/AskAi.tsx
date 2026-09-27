import { useCallback, useRef, useState } from 'react';
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

/** Kopierar text; reserv med markering + execCommand när Clipboard API saknas. */
async function copyText(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    // Clipboard API finns bara i säkra sammanhang (https, localhost).
    if ('clipboard' in navigator) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Prova reserven nedan.
  }
  if (!fallback) return false;
  fallback.select();
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- reserv för äldre webbläsare
  return document.execCommand('copy');
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
    if (typeof navigator.share !== 'function') {
      await copy();
      return;
    }
    try {
      await navigator.share({ text: prompt });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      await copy();
    }
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

  return (
    <div className="ask-ai" data-testid="ask-ai">
      <fieldset className="choices">
        <legend className="field-label">Ta med</legend>
        {visible.map((o) => {
          const hint = missingHint(o.id, context);
          return (
            <label key={o.id} className="check">
              <input
                type="checkbox"
                checked={options[o.id]}
                onChange={(e) => {
                  toggle(o.id, e.target.checked);
                }}
              />
              <span>
                {optionLabel(o, scope)}
                {hint && <span className="check-hint">{hint}</span>}
              </span>
            </label>
          );
        })}
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
