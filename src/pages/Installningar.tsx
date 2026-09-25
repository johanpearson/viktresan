import { useEffect, useState } from 'react';
import { ExportBackup } from '../components/ExportBackup.tsx';
import { ImportBackup } from '../components/ImportBackup.tsx';
import { LockSettings } from '../components/LockSettings.tsx';
import { Page } from '../components/Page.tsx';
import { ProfileForm } from '../components/ProfileForm.tsx';
import {
  formatBytes,
  getStorageStatus,
  requestPersistence,
  type PersistenceState,
  type StorageStatus,
} from '../lib/storage.ts';
import { useAppData } from '../lib/useAppData.ts';
import { useBackupStatus } from '../lib/useBackupStatus.ts';

const PERSISTENCE_TEXT: Record<PersistenceState, string> = {
  persisted: 'Beständig – webbläsaren rensar inte din data automatiskt.',
  'not-persisted':
    'Inte beständig – webbläsaren kan rensa din data vid lagringsbrist. Installera appen på hemskärmen för bäst skydd.',
  unsupported: 'Webbläsaren stöder inte beständig lagring.',
};

export function Installningar() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [requesting, setRequesting] = useState(false);
  const { data, reload } = useAppData();
  const backup = useBackupStatus();
  const [imports, setImports] = useState(0);

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
        <h2 className="card-title">Profil</h2>
        {data && (
          <ProfileForm
            // Ny nyckel efter import så att formuläret fylls i med den importerade profilen.
            key={imports}
            profile={data.profile}
            onSaved={() => {
              void reload();
            }}
          />
        )}
      </div>
      <section className="card" aria-labelledby="backup-title">
        <h2 className="card-title" id="backup-title">
          Säkerhetskopia
        </h2>
        <p className="form-note">
          Allt – profil, mätningar, matlogg och bilder – sparas i en zip-fil som du kan dela till
          t.ex. molnlagring eller e-post. Datan lämnar bara enheten när du själv väljer det.
        </p>
        <ExportBackup status={backup.status} onExported={backup.markExported} />
        <ImportBackup
          onImported={async () => {
            await Promise.all([reload(), backup.reload()]);
            setImports((n) => n + 1);
            setStatus(await getStorageStatus());
          }}
        />
      </section>
      <LockSettings />
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
