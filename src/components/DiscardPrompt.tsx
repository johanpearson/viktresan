import { useEffect, useRef } from 'react';
import { useDiscardPrompt } from '../lib/navigation.ts';

/**
 * "Kasta ändringar?" när en panel med osparade ändringar stängs med bakåt (eller Esc).
 * Modal <dialog> ovanpå panelen. Bakåt, Esc eller "Fortsätt redigera" behåller panelen.
 */
export function DiscardPrompt() {
  const { open, keep, discard } = useDiscardPrompt();
  if (!open) return null;
  return <DiscardDialog onKeep={keep} onDiscard={discard} />;
}

function DiscardDialog({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    // Det ofarliga valet har fokus.
    keepRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="sheet discard-prompt"
      aria-labelledby="discard-title"
      aria-describedby="discard-text"
      data-testid="discard-prompt"
      onCancel={(e) => {
        e.preventDefault();
        onKeep();
      }}
    >
      <div className="sheet-panel">
        <h2 className="sheet-title" id="discard-title">
          Kasta ändringar?
        </h2>
        <p className="discard-prompt-text" id="discard-text">
          Det du har fyllt i är inte sparat.
        </p>
        <div className="discard-prompt-actions">
          <button type="button" className="button button-secondary" ref={keepRef} onClick={onKeep}>
            Fortsätt redigera
          </button>
          <button type="button" className="button button-danger" onClick={onDiscard}>
            Kasta
          </button>
        </div>
      </div>
    </dialog>
  );
}
