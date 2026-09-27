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
    <div className="form">
      {supported === false && !enabled ? (
        <p className="form-note" data-testid="lock-unsupported">
          Den här enheten eller webbläsaren saknar stöd för upplåsning med fingeravtryck.
        </p>
      ) : (
        <>
          <label className="switch-row">
            <span className="switch-text">
              <span className="switch-label">Lås appen med fingeravtryck</span>
              <span className="switch-description" id="lock-desc">
                Appen låses när du lämnar den och öppnas med fingeravtryck, ansikte eller skärmlås.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={enabled}
              disabled={busy || supported === null}
              aria-describedby="lock-desc"
              onChange={(e) => void toggle(e.target.checked)}
            />
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
        </>
      )}
      <p className="muted form-note">
        Låset skyddar mot nyfikna blickar men krypterar inte datan på enheten. Tappar du bort
        fingeravtrycket (t.ex. efter byte av skärmlås) kan du bara komma åt appen genom att rensa
        webbplatsdatan – exportera därför en säkerhetskopia först.
      </p>
    </div>
  );
}
