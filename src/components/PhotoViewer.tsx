import { useEffect, useRef, type ReactNode } from 'react';
import { CAPTURE_ANGLES, ANGLE_LABELS, type CaptureAngle } from '../lib/photoSessions.ts';
import type { PhotoItem } from '../lib/usePhotos.ts';
import { SegmentedControl } from './SegmentedControl.tsx';

interface PhotoViewerProps {
  /** Bilderna i den ordning man bläddrar (nyast först). */
  photos: readonly PhotoItem[];
  photoId: string;
  /** Bildtext, t.ex. "25 sep. 2026 · 84,2 kg · Framifrån". */
  labelFor: (photo: PhotoItem) => string;
  onNavigate: (id: string) => void;
  onSetAngle: (id: string, angle: CaptureAngle) => Promise<void>;
  /** Tar bort direkt; anroparen visar en Toast med Ångra (skickas in som `toast`). */
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  /** Kvittens (Toast) som ska synas ovanpå helskärmsvyn. */
  toast?: ReactNode;
}

/**
 * Helskärmsvy för en bild, som modal <dialog> (Esc och bakåt stänger). Som en panel: rubrik med
 * textknappen "Stäng", och "Ta bort bilden" som destruktiv textknapp längst ner – borttagningen
 * sker direkt och följs av en Toast med Ångra.
 */
export function PhotoViewer({
  photos,
  photoId,
  labelFor,
  onNavigate,
  onSetAngle,
  onDelete,
  onClose,
  toast,
}: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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

  return (
    <dialog className="viewer" ref={dialogRef} aria-labelledby="viewer-title" onClose={onClose}>
      <div className="viewer-header">
        <p className="viewer-title" id="viewer-title">
          {label}
        </p>
        <button type="button" className="button button-ghost button-small" onClick={onClose}>
          Stäng
        </button>
      </div>
      <img className="viewer-image" src={photo.url} alt={`Progressbild ${label}`} />
      <SegmentedControl
        label="Vinkel"
        options={CAPTURE_ANGLES.map((angle) => ({ id: angle, label: ANGLE_LABELS[angle] }))}
        value={photo.angle === 'okand' ? null : photo.angle}
        onChange={(angle) => void onSetAngle(photo.id, angle)}
        className="viewer-angles"
      />
      <div className="viewer-toolbar">
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={!older}
          onClick={() => {
            if (older) onNavigate(older.id);
          }}
        >
          Äldre
        </button>
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={!newer}
          onClick={() => {
            if (newer) onNavigate(newer.id);
          }}
        >
          Nyare
        </button>
      </div>
      <button
        type="button"
        className="button button-ghost button-small button-danger-text viewer-delete"
        onClick={() => void onDelete(photo.id)}
      >
        Ta bort bilden
      </button>
      {toast}
    </dialog>
  );
}
