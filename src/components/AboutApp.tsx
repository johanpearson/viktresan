import { useState } from 'react';
import { checkForUpdate, type UpdateCheckResult } from '../lib/pwaUpdate.ts';
import { BUILD_INFO, formatBuildTime } from '../lib/version.ts';

const RESULT_TEXT: Record<UpdateCheckResult, string> = {
  available: 'Ny version finns – tryck Uppdatera i rutan längst ner.',
  latest: 'Du har den senaste versionen.',
  failed: 'Kunde inte söka efter uppdatering. Är du ansluten till internet?',
  unsupported: 'Uppdateringar hanteras inte i den här webbläsaren.',
};

/** Inställningar → Om appen: version, commit, byggtid och manuell uppdateringskontroll. */
export function AboutApp() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

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
    <section className="card" aria-labelledby="about-title">
      <h2 className="card-title" id="about-title">
        Om appen
      </h2>
      <dl className="kv">
        <dt>Version</dt>
        <dd data-testid="app-version">{BUILD_INFO.version}</dd>
        <dt>Commit</dt>
        <dd data-testid="app-commit">{BUILD_INFO.commit}</dd>
        <dt>Byggd</dt>
        <dd data-testid="app-build-time">
          <time dateTime={BUILD_INFO.buildTime}>{formatBuildTime(BUILD_INFO.buildTime)}</time>
        </dd>
      </dl>
      <button
        type="button"
        className="button button-secondary"
        disabled={checking}
        onClick={() => void handleCheck()}
      >
        Sök efter uppdatering
      </button>
      <p className="form-ok" role="status" data-testid="update-check-result">
        {checking ? 'Söker…' : result && RESULT_TEXT[result]}
      </p>
    </section>
  );
}
