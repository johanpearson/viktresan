import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LockError, handleVisibilityChange, initLock, unlock, useLockStatus } from '../lib/lock.ts';

/** Visar låsskärmen i stället för appen när låset är på och appen är låst. */
export function LockGate({ children }: { children: ReactNode }) {
  const status = useLockStatus();

  useEffect(() => {
    void initLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Rendera ingenting förrän vi vet om appen ska vara låst – inget ska synas i förväg.
  if (status === 'loading') return null;
  if (status === 'locked') return <LockScreen />;
  return children;
}

function LockScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = 'Låst – Viktresan';
    headingRef.current?.focus();
  }, []);

  async function handleUnlock() {
    setBusy(true);
    setError(null);
    try {
      await unlock();
    } catch (err) {
      setError(err instanceof LockError ? err.message : 'Upplåsningen misslyckades.');
      setBusy(false);
    }
  }

  return (
    <main className="lock-screen" aria-labelledby="lock-screen-title">
      <svg className="lock-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 10V7a5 5 0 0 1 10 0v3" />
        <rect x="4" y="10" width="16" height="11" rx="2" />
      </svg>
      <h1 className="page-title" id="lock-screen-title" tabIndex={-1} ref={headingRef}>
        Viktresan är låst
      </h1>
      <p className="muted">Lås upp med fingeravtryck, ansikte eller skärmlås.</p>
      <button type="button" className="button" disabled={busy} onClick={() => void handleUnlock()}>
        {busy ? 'Väntar på fingeravtryck…' : 'Lås upp'}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
