import { useEffect } from 'react';

interface ToastProps {
  message: string;
  /** Visar "Ångra" (t.ex. efter en borttagning eller ett snabbval). */
  onUndo?: (() => void) | undefined;
  onClose: () => void;
  /** Tillgängligt namn på regionen, t.ex. "Mat". */
  label?: string;
  testId?: string;
  /** Hur länge kvittensen visas (ms). */
  timeoutMs?: number;
}

const TIMEOUT_MS = 8000;

/**
 * Kvittens längst ner ovanför navigeringen: meddelande + Ångra (valfri) + Stäng.
 * Försvinner av sig själv. Destruktiva åtgärder i listor ska alltid följas av en
 * Toast med Ångra i stället för en bekräftelsedialog.
 */
export function Toast({
  message,
  onUndo,
  onClose,
  label = 'Kvittens',
  testId,
  timeoutMs = TIMEOUT_MS,
}: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, timeoutMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message, onClose, timeoutMs]);

  return (
    <section className="toast toast-shortcut" aria-label={label} data-testid={testId}>
      <p className="toast-text" role="status">
        {message}
      </p>
      <div className="toast-actions">
        {onUndo && (
          <button type="button" className="button button-small toast-undo" onClick={onUndo}>
            Ångra
          </button>
        )}
        <button type="button" className="button button-ghost button-small" onClick={onClose}>
          Stäng
        </button>
      </div>
    </section>
  );
}
