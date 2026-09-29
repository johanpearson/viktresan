import { applyUpdate, dismissUpdate, useUpdateAvailable } from '../lib/pwaUpdate.ts';
import { Card } from './Card.tsx';

/**
 * Översikt: kontextkortet "Ny version finns" (på övriga sidor är det en toast). Senare döljer
 * det tills nästa start; den nya versionen väntar kvar.
 */
export function UpdateCard() {
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <Card
      title="Ny version finns"
      tone="info"
      testId="update-card"
      action={
        <button type="button" className="button button-ghost button-small" onClick={dismissUpdate}>
          Senare
        </button>
      }
    >
      <p className="form-note">Uppdatera när det passar – din data påverkas inte.</p>
      <button type="button" className="button button-secondary button-small" onClick={applyUpdate}>
        Uppdatera
      </button>
    </Card>
  );
}
