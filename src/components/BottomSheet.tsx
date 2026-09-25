import { useEffect, useRef, type ReactNode } from 'react';

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Panel som glider upp nerifrån, som modal <dialog>: fokus stannar i panelen och
 * Esc, "Stäng" eller ett tryck utanför stänger den.
 */
export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  function close() {
    const dialog = dialogRef.current;
    // `close()` skickar ett close-event som i sin tur anropar onClose.
    if (dialog?.open && typeof dialog.close === 'function') dialog.close();
    else onClose();
  }

  return (
    <dialog
      className="sheet"
      ref={dialogRef}
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        // Tryck på bakgrunden (utanför panelens innehåll) stänger.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet-panel">
        <div className="sheet-header">
          <h2 className="sheet-title" id="sheet-title">
            {title}
          </h2>
          <button type="button" className="button button-secondary button-small" onClick={close}>
            Stäng
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
