import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Celebration } from '../lib/celebration.ts';
import { fireConfetti } from '../lib/confetti.ts';

/** Små milstolpar försvinner av sig själva efter en stund. */
const TOAST_MS = 8000;

interface MilestoneToastProps {
  celebration: Celebration;
  onClose: () => void;
}

/** Öppen modal panel (t.ex. Logga vikt), om någon. Allt utanför den är inert. */
function openModal(): Element | null {
  try {
    return document.querySelector('dialog:modal');
  } catch {
    return null;
  }
}

/**
 * Diskret firande för mindre milstolpar: toast högst upp med en liten animation.
 * Visas som popover (överst). Är en panel öppen läggs toasten i panelen – annars vore
 * den inert och gick inte att trycka bort. Tryck stänger.
 */
export function MilestoneToast({ celebration, onClose }: MilestoneToastProps) {
  const ref = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { milestone } = celebration;
  const [host] = useState(openModal);

  useEffect(() => {
    const el = ref.current;
    if (el && typeof el.showPopover === 'function' && !el.matches(':popover-open')) {
      el.showPopover();
    }
    const canvas = canvasRef.current;
    const stop = canvas ? fireConfetti(canvas, 'liten') : () => undefined;
    const timer = window.setTimeout(onClose, TOAST_MS);
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [onClose]);

  const toast = (
    <section
      ref={ref}
      popover="manual"
      className="milestone-toast"
      aria-label="Milstolpe"
      data-testid="milestone-toast"
      data-milestone={milestone.id}
      onClick={onClose}
    >
      <canvas ref={canvasRef} className="milestone-toast-canvas" aria-hidden="true" />
      <span className="milestone-toast-badge" aria-hidden="true">
        {milestone.badge}
      </span>
      <div className="milestone-toast-body" aria-live="polite">
        <p className="milestone-toast-title">{milestone.title}</p>
        <p className="milestone-toast-text">{celebration.message}</p>
        {milestone.action === 'jamfor-bilder' && (
          <a className="button button-small" href="#/framsteg/bilder/jamfor">
            Öppna jämförelsen
          </a>
        )}
      </div>
      <button type="button" className="button button-secondary button-small">
        Stäng
      </button>
    </section>
  );
  return host ? createPortal(toast, host) : toast;
}
