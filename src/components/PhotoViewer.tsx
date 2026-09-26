import { useEffect, useRef, useState } from 'react';
import { CAPTURE_ANGLES, ANGLE_LABELS, type CaptureAngle } from '../lib/photoSessions.ts';
import type { PhotoItem } from '../lib/usePhotos.ts';

interface PhotoViewerProps {
  /** Bilderna i den ordning man bläddrar (nyast först). */
  photos: readonly PhotoItem[];
  photoId: string;
  /** Bildtext, t.ex. "25 sep. 2026 · 84,2 kg · Framifrån". */
  labelFor: (photo: PhotoItem) => string;
  onNavigate: (id: string) => void;
  onSetAngle: (id: string, angle: CaptureAngle) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

/** Helskärmsvy för en bild, som modal <dialog> (Esc och bakåt stänger). */
export function PhotoViewer({
  photos,
  photoId,
  labelFor,
  onNavigate,
  onSetAngle,
  onDelete,
  onClose,
}: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const index = photos.findIndex((p) => p.id === photoId);
  const photo = photos[index];
  const newer = photos[index - 1];
  const older = photos[index + 1];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // När dialogen tas bort ur DOM:en upphör den att vara modal, så ingen städning behövs.
    if (dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  if (!photo) return null;
  const label = labelFor(photo);

  async function handleDelete(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    await onDelete(id);
  }

  return (
    <dialog className="viewer" ref={dialogRef} aria-labelledby="viewer-title" onClose={onClose}>
      <p className="viewer-title" id="viewer-title">
        {label}
      </p>
      <img className="viewer-image" src={photo.url} alt={`Progressbild ${label}`} />
      <div className="segmented viewer-angles" role="group" aria-label="Vinkel">
        {CAPTURE_ANGLES.map((angle) => (
          <button
            key={angle}
            type="button"
            className="segmented-button"
            aria-pressed={photo.angle === angle}
            onClick={() => void onSetAngle(photo.id, angle)}
          >
            {ANGLE_LABELS[angle]}
          </button>
        ))}
      </div>
      <div className="viewer-toolbar">
        <button
          type="button"
          className="button button-secondary button-small viewer-button"
          disabled={!older}
          onClick={() => {
            if (older) onNavigate(older.id);
          }}
        >
          Äldre
        </button>
        <button
          type="button"
          className="button button-secondary button-small viewer-button"
          disabled={!newer}
          onClick={() => {
            if (newer) onNavigate(newer.id);
          }}
        >
          Nyare
        </button>
        <button
          type="button"
          className="button button-danger button-small viewer-button"
          onClick={() => void handleDelete(photo.id)}
        >
          {confirmId === photo.id ? 'Bekräfta borttagning' : 'Ta bort'}
        </button>
        <button type="button" className="button button-small viewer-button" onClick={onClose}>
          Stäng
        </button>
      </div>
    </dialog>
  );
}
