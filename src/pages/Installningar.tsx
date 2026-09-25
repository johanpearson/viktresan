import { useEffect, useState } from 'react';
import { Page } from '../components/Page.tsx';
import {
  formatBytes,
  getStorageStatus,
  requestPersistence,
  type PersistenceState,
  type StorageStatus,
} from '../lib/storage.ts';

const PERSISTENCE_TEXT: Record<PersistenceState, string> = {
  persisted: 'Beständig – webbläsaren rensar inte din data automatiskt.',
  'not-persisted':
    'Inte beständig – webbläsaren kan rensa din data vid lagringsbrist. Installera appen på hemskärmen för bäst skydd.',
  unsupported: 'Webbläsaren stöder inte beständig lagring.',
};

export function Installningar() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let active = true;
    void getStorageStatus().then((result) => {
      if (active) setStatus(result);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleRequest() {
    setRequesting(true);
    try {
      await requestPersistence();
      setStatus(await getStorageStatus());
    } finally {
      setRequesting(false);
    }
  }

  return (
    <Page title="Inställningar">
      <div className="card">
        <h2 className="card-title">Lagring</h2>
        <dl className="kv">
          <dt>Status</dt>
          <dd data-testid="persistence-status" data-state={status?.persistence ?? 'loading'}>
            {status ? PERSISTENCE_TEXT[status.persistence] : 'Kontrollerar…'}
          </dd>
          {status?.usage != null && status.quota != null && (
            <>
              <dt>Använt</dt>
              <dd>
                {formatBytes(status.usage)} av {formatBytes(status.quota)}
              </dd>
            </>
          )}
        </dl>
        {status?.persistence === 'not-persisted' && (
          <button
            type="button"
            className="button"
            onClick={() => void handleRequest()}
            disabled={requesting}
          >
            Begär beständig lagring
          </button>
        )}
        <p className="muted">All data lagras endast lokalt på den här enheten.</p>
      </div>
    </Page>
  );
}
