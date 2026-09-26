import { FEATURES } from '../lib/features.ts';
import { formatMl } from '../lib/format.ts';
import type { ShortcutState } from '../lib/useShortcut.ts';

/** Kvittens efter en genväg från appikonen: "+250 ml" med Ångra, eller avstängd funktion. */
export function ShortcutToast({ state }: { state: ShortcutState }) {
  const { toast } = state;
  if (!toast) return null;

  if (toast.kind === 'water') {
    return (
      <section className="toast toast-shortcut" aria-label="Genväg" data-testid="shortcut-toast">
        <p className="toast-text" role="status">
          {toast.undone
            ? `Ångrade ${formatMl(toast.ml)}.`
            : `La till ${formatMl(toast.ml)} vatten.`}
        </p>
        <div className="toast-actions">
          {!toast.undone && (
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => void state.undo()}
            >
              Ångra
            </button>
          )}
          <button type="button" className="button button-small" onClick={state.dismiss}>
            Stäng
          </button>
        </div>
      </section>
    );
  }

  const label = FEATURES.find((f) => f.id === toast.feature)?.label ?? toast.feature;
  return (
    <section className="toast toast-shortcut" aria-label="Genväg" data-testid="shortcut-toast">
      <p className="toast-text" role="status">
        {label} är avstängt. Slå på det för att använda genvägen ”{toast.shortcut.name}”.
      </p>
      <div className="toast-actions">
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={state.dismiss}
        >
          Inte nu
        </button>
        <button type="button" className="button button-small" onClick={() => void state.enable()}>
          Slå på {label}
        </button>
      </div>
    </section>
  );
}
