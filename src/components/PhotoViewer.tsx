import { useEffect, useRef, useState } from 'react';
import { formatPhotoLabel } from '../lib/format.ts';
import type { PhotoItem } from '../lib/usePhotos.ts';

interface PhotoViewerProps {
  /** Bilderna i den ordning man bläddrar (nyast först). */
  photos: readonly PhotoItem[];
  photoId: string;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

/** Helskärmsvy för en bild, som modal <dialog> (Esc och bakåt stänger). */
export function PhotoViewer({ photos, photoId, onNavigate, onDelete, onClose }: PhotoViewerProps) {
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
        {formatPhotoLabel(photo)}
      </p>
      <img
        className="viewer-image"
        src={photo.url}
        alt={`Progressbild ${formatPhotoLabel(photo)}`}
      />
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
