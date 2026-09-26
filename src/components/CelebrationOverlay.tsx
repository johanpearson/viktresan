import { useEffect, useRef } from 'react';
import type { Celebration } from '../lib/celebration.ts';
import { fireConfetti } from '../lib/confetti.ts';
import { formatDate } from '../lib/format.ts';
import { GoalReachedActions } from './GoalReachedActions.tsx';

interface CelebrationOverlayProps {
  celebration: Celebration;
  onClose: () => void;
}

/**
 * Helskärmsfirande för stora milstolpar: konfetti, stor siffra och ett peppande
 * meddelande. Modal <dialog> så att det hamnar överst även när en panel är öppen.
 * Ett tryck var som helst (utom på knapparna) eller Esc stänger.
 */
export function CelebrationOverlay({ celebration, onClose }: CelebrationOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { milestone } = celebration;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    const canvas = canvasRef.current;
    return canvas ? fireConfetti(canvas, 'stor') : undefined;
  }, []);

  function close() {
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === 'function') dialog.close();
    else onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="celebration"
      aria-labelledby="celebration-title"
      aria-describedby="celebration-message"
      data-testid="celebration"
      data-milestone={milestone.id}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        // Ett tryck stänger – även på länkarna – utom på knappar som gör något på plats.
        if ((e.target as HTMLElement).closest('[data-keep-open]')) return;
        close();
      }}
    >
      <canvas ref={canvasRef} className="celebration-canvas" aria-hidden="true" />
      <div className="celebration-card">
        <p className="celebration-badge" aria-hidden="true">
          {milestone.badge}
        </p>
        <h2 className="celebration-title" id="celebration-title">
          {milestone.title}
        </h2>
        <p className="celebration-message" id="celebration-message">
          {celebration.message}
        </p>
        <p className="celebration-date muted">{formatDate(celebration.date)}</p>
        {celebration.others > 0 && (
          <p className="celebration-more">
            Du nådde{' '}
            {celebration.others === 1 ? 'en milstolpe' : `${String(celebration.others)} milstolpar`}{' '}
            till samtidigt – de finns under{' '}
            <a href="#/framsteg/milstolpar">Framsteg → Milstolpar</a>.
          </p>
        )}
        {milestone.action === 'nytt-mal' && <GoalReachedActions />}
        {milestone.action === 'jamfor-bilder' && (
          <a className="button" href="#/framsteg/bilder/jamfor">
            Öppna jämförelsen
          </a>
        )}
        <button type="button" className="button button-secondary celebration-close">
          Stäng
        </button>
        <p className="celebration-hint muted" aria-hidden="true">
          Tryck var som helst för att stänga
        </p>
      </div>
    </dialog>
  );
}
