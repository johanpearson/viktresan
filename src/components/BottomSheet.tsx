import { useEffect, useRef, type ReactNode } from 'react';
import { prefersReducedMotion } from '../lib/motion.ts';

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  /** Helskärm (t.ex. sök i Mat) i stället för en panel nerifrån. */
  full?: boolean;
  children: ReactNode;
}

/** Stängningens längd – samma som --duration-fast. */
const CLOSE_MS = 150;

/**
 * Panel som glider upp nerifrån, som modal <dialog>: fokus stannar i panelen och
 * Esc, "Stäng" eller ett tryck utanför stänger den. Öppnas (200 ms) och stängs
 * (150 ms, glider ner och tonar ut) med en kort övergång; ingen vid prefers-reduced-motion. Innehållet
 * ligger direkt på panelen – kort inne i en panel ritas utan egen ram.
 */
export function BottomSheet({ title, onClose, full = false, children }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  function close() {
    const dialog = dialogRef.current;
    if (!dialog?.open || typeof dialog.close !== 'function') {
      onClose();
      return;
    }
    // `close()` skickar ett close-event som i sin tur anropar onClose.
    if (typeof dialog.animate !== 'function' || prefersReducedMotion()) {
      dialog.close();
      return;
    }
    if (closing.current) return;
    closing.current = true;
    const frames = [
      { transform: 'translateY(0)', opacity: 1 },
      { transform: full ? 'translateY(24px)' : 'translateY(48px)', opacity: 0 },
    ];
    const animation = dialog.animate(frames, {
      duration: CLOSE_MS,
      easing: 'ease-in',
      fill: 'forwards',
    });
    // Stäng när animationen är klar – men aldrig senare än efter CLOSE_MS + marginal,
    // även om animationens tidslinje står still (bakgrundsflik, fryst klocka i tester).
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      closing.current = false;
      if (dialog.open) dialog.close();
      animation.cancel();
    };
    window.setTimeout(finish, CLOSE_MS + 50);
    void animation.finished.then(finish, finish);
  }

  return (
    <dialog
      className={full ? 'sheet sheet-full' : 'sheet'}
      ref={dialogRef}
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        // Tryck på bakgrunden (utanför panelens innehåll) stänger.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet-panel">
        {!full && <span className="sheet-grabber" aria-hidden="true" />}
        <div className="sheet-header">
          <h2 className="sheet-title" id="sheet-title">
            {title}
          </h2>
          <button type="button" className="button button-ghost button-small" onClick={close}>
            Stäng
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
