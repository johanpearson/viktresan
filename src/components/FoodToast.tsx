import { useEffect } from 'react';

interface FoodToastProps {
  message: string;
  /** Visar "Ångra" (t.ex. efter en borttagning). */
  onUndo?: (() => void) | undefined;
  onClose: () => void;
}

/** Hur länge kvittensen visas. */
const TIMEOUT_MS = 8000;

/** Kvittens i Mat → Dag: "Tog bort …" med Ångra, eller "Uppdaterade …". */
export function FoodToast({ message, onUndo, onClose }: FoodToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message, onClose]);

  return (
    <section className="toast toast-shortcut" aria-label="Mat" data-testid="food-toast">
      <p className="toast-text" role="status">
        {message}
      </p>
      <div className="toast-actions">
        {onUndo && (
          <button type="button" className="button button-secondary button-small" onClick={onUndo}>
            Ångra
          </button>
        )}
        <button type="button" className="button button-small" onClick={onClose}>
          Stäng
        </button>
      </div>
    </section>
  );
}
