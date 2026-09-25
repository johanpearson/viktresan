import { applyUpdate, dismissUpdate, useUpdateAvailable } from '../lib/pwaUpdate.ts';

/** "Ny version finns" – visas när en ny service worker väntar. */
export function UpdateToast() {
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <section className="toast" aria-label="Uppdatering" data-testid="update-toast">
      <p className="toast-text" role="status">
        Ny version finns
      </p>
      <div className="toast-actions">
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={dismissUpdate}
        >
          Senare
        </button>
        <button type="button" className="button button-small" onClick={applyUpdate}>
          Uppdatera
        </button>
      </div>
    </section>
  );
}
