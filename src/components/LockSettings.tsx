import { useEffect, useState } from 'react';
import {
  LockError,
  disableLock,
  enableLock,
  isLockSupported,
  lockNow,
  useLockStatus,
} from '../lib/lock.ts';

export function LockSettings() {
  const status = useLockStatus();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = status === 'unlocked' || status === 'locked';

  useEffect(() => {
    let active = true;
    void isLockSupported().then((result) => {
      if (active) setSupported(result);
    });
    return () => {
      active = false;
    };
  }, []);

  async function toggle(on: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (on) await enableLock();
      else await disableLock();
    } catch (err) {
      setError(err instanceof LockError ? err.message : 'Det gick inte att ändra låset.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="lock-title">
      <h2 className="card-title" id="lock-title">
        Lås
      </h2>
      {supported === false && !enabled ? (
        <p className="form-note" data-testid="lock-unsupported">
          Den här enheten eller webbläsaren saknar stöd för upplåsning med fingeravtryck.
        </p>
      ) : (
        <div className="form">
          <label className="check">
            <input
              type="checkbox"
              role="switch"
              checked={enabled}
              disabled={busy || supported === null}
              onChange={(e) => void toggle(e.target.checked)}
            />
            <span>
              Lås appen med fingeravtryck
              <span className="check-hint">
                Appen låses när du lämnar den och öppnas med fingeravtryck, ansikte eller skärmlås.
              </span>
            </span>
          </label>
          {enabled && (
            <button type="button" className="button button-secondary" onClick={lockNow}>
              Lås nu
            </button>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <p className="muted form-note">
        Låset skyddar mot nyfikna blickar men krypterar inte datan på enheten. Tappar du bort
        fingeravtrycket (t.ex. efter byte av skärmlås) kan du bara komma åt appen genom att rensa
        webbplatsdatan – exportera därför en säkerhetskopia först.
      </p>
    </section>
  );
}
