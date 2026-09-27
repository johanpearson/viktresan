import { useState } from 'react';
import {
  applyUpdate,
  checkForUpdate,
  useUpdateAvailable,
  type UpdateCheckResult,
} from '../lib/pwaUpdate.ts';
import { BUILD_INFO, formatBuildTime } from '../lib/version.ts';
import { Feature } from './Feature.tsx';
import { ListRow } from './ListRow.tsx';
import { LivsmedelSource } from './LivsmedelSource.tsx';

const RESULT_TEXT: Record<UpdateCheckResult, string> = {
  available: 'Ny version finns.',
  latest: 'Du har den senaste versionen.',
  failed: 'Kunde inte söka efter uppdatering. Är du ansluten till internet?',
  unsupported: 'Uppdateringar hanteras inte i den här webbläsaren.',
};

/**
 * Inställningar → Om appen: version, commit, byggtid, manuell uppdateringskontroll
 * och källan för näringsvärdena i Mat.
 */
export function AboutApp() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  // Kvittensen längst ner ligger under panelen – därför en egen Uppdatera-knapp här.
  const available = useUpdateAvailable();

  async function handleCheck() {
    setChecking(true);
    setResult(null);
    try {
      setResult(await checkForUpdate());
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="form">
      <ul className="list list-flush">
        <ListRow
          primary="Version"
          value={<span data-testid="app-version">{BUILD_INFO.version}</span>}
        />
        <ListRow
          primary="Commit"
          value={<span data-testid="app-commit">{BUILD_INFO.commit}</span>}
        />
        <ListRow
          primary="Byggd"
          value={
            <span data-testid="app-build-time">
              <time dateTime={BUILD_INFO.buildTime}>{formatBuildTime(BUILD_INFO.buildTime)}</time>
            </span>
          }
        />
      </ul>
      <Feature id="mat">
        <LivsmedelSource />
      </Feature>
      {available ? (
        <button type="button" className="button" onClick={applyUpdate}>
          Uppdatera nu
        </button>
      ) : (
        <button
          type="button"
          className="button button-secondary"
          disabled={checking}
          onClick={() => void handleCheck()}
        >
          Sök efter uppdatering
        </button>
      )}
      <p className="form-ok" role="status" data-testid="update-check-result">
        {checking ? 'Söker…' : result && RESULT_TEXT[result]}
      </p>
    </div>
  );
}
