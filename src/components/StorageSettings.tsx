import { useState } from 'react';
import {
  formatBytes,
  getStorageStatus,
  requestPersistence,
  type PersistenceState,
  type StorageStatus,
} from '../lib/storage.ts';
import { ListRow } from './ListRow.tsx';

const PERSISTENCE_TEXT: Record<PersistenceState, string> = {
  persisted: 'Beständig – webbläsaren rensar inte din data automatiskt.',
  'not-persisted':
    'Inte beständig – webbläsaren kan rensa din data vid lagringsbrist. Installera appen på hemskärmen för bäst skydd.',
  unsupported: 'Webbläsaren stöder inte beständig lagring.',
};

interface StorageSettingsProps {
  status: StorageStatus | null;
  onChange: (status: StorageStatus) => void;
}

/** Inställningar → Lagring: beständig lagring och använt utrymme. */
export function StorageSettings({ status, onChange }: StorageSettingsProps) {
  const [requesting, setRequesting] = useState(false);

  async function handleRequest() {
    setRequesting(true);
    try {
      await requestPersistence();
      onChange(await getStorageStatus());
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="form">
      <p
        className="form-note"
        data-testid="persistence-status"
        data-state={status?.persistence ?? 'loading'}
      >
        {status ? PERSISTENCE_TEXT[status.persistence] : 'Kontrollerar…'}
      </p>
      {status?.usage != null && status.quota != null && (
        <ul className="list list-flush">
          <ListRow
            primary="Använt"
            value={
              <span data-testid="storage-usage">
                {formatBytes(status.usage)} av {formatBytes(status.quota)}
              </span>
            }
          />
        </ul>
      )}
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
      <p className="muted form-note">All data lagras endast lokalt på den här enheten.</p>
    </div>
  );
}
