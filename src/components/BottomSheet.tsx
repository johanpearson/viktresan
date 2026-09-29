import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '../lib/motion.ts';
import { OverlayLevel, requestDiscard, useOverlay } from '../lib/navigation.ts';

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
 *
 * Panelen har en egen post i historiken (`useOverlay`): bakåt stänger den. Har något formulär i
 * panelen ändrats sedan det senast skickades frågar bakåt (och Esc) "Kasta ändringar?" först.
 */
export function BottomSheet({ title, onClose, full = false, children }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  // Unikt id: en panel kan öppnas ovanpå en annan (radmeny i en Logga-panel).
  const titleId = useId();
  // Rubrikraden får en linje när innehållet scrollats under den (som sidhuvudet).
  const [stuck, setStuck] = useState(false);
  // Formulär i panelen (inte i nästlade paneler) med ändringar som inte skickats.
  const dirtyForms = useRef(new Set<HTMLFormElement>());

  function isDirty(): boolean {
    const dialog = dialogRef.current;
    return [...dirtyForms.current].some((f) => f.isConnected && f.closest('dialog') === dialog);
  }

  const childLevel = useOverlay(
    () => {
      if (dialogRef.current?.open) close();
    },
    { dirty: isDirty },
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const forms = dirtyForms.current;
    function ownForm(target: EventTarget | null): HTMLFormElement | null {
      if (!(target instanceof Element) || target.closest('dialog') !== dialog) return null;
      return target instanceof HTMLFormElement ? target : target.closest('form');
    }
    function onInput(event: Event) {
      const target = event.target;
      // Sökfält och filval är inga ändringar att förlora.
      if (
        target instanceof HTMLInputElement &&
        (target.type === 'search' || target.type === 'file')
      )
        return;
      const form = ownForm(target);
      if (form) forms.add(form);
    }
    function onSubmit(event: Event) {
      const form = ownForm(event.target);
      if (form) forms.delete(form);
    }
    dialog.addEventListener('input', onInput);
    dialog.addEventListener('change', onInput);
    dialog.addEventListener('submit', onSubmit);
    dialog.addEventListener('reset', onSubmit);
    return () => {
      dialog.removeEventListener('input', onInput);
      dialog.removeEventListener('change', onInput);
      dialog.removeEventListener('submit', onSubmit);
      dialog.removeEventListener('reset', onSubmit);
    };
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
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc, och Androids bakåt när webbläsaren låter den stänga dialogen direkt.
        if (e.target !== e.currentTarget || !isDirty()) return;
        e.preventDefault();
        requestDiscard(close);
      }}
      onClose={(e) => {
        // React låter close bubbla genom komponentträdet: en radmeny som stängs ovanpå
        // panelen ska inte stänga panelen.
        if (e.target === e.currentTarget) onClose();
      }}
      onScroll={(e) => {
        const scrolled = e.currentTarget.scrollTop > 0;
        if (scrolled !== stuck) setStuck(scrolled);
      }}
      onClick={(e) => {
        // Tryck på bakgrunden (utanför panelens innehåll) stänger.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet-panel">
        {!full && <span className="sheet-grabber" aria-hidden="true" />}
        <div className="sheet-header" data-stuck={stuck}>
          <h2 className="sheet-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="button button-ghost button-small" onClick={close}>
            Stäng
          </button>
        </div>
        <OverlayLevel value={childLevel}>{children}</OverlayLevel>
      </div>
    </dialog>
  );
}
