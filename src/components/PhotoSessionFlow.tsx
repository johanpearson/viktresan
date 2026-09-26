import { useEffect, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import {
  deletePhoto,
  newId,
  putPhoto,
  putPhotoSession,
  type PhotoEntry,
  type PhotoSession,
  type WeightEntry,
} from '../db/db.ts';
import { cameraSupported } from '../lib/camera.ts';
import { todayIso } from '../lib/dates.ts';
import { formatDate, formatInt } from '../lib/format.ts';
import { compressImage } from '../lib/image.ts';
import {
  ANGLE_LABELS,
  CAPTURE_ANGLES,
  pickGhost,
  trendWeightText,
  type CaptureAngle,
  type ProfileSide,
} from '../lib/photoSessions.ts';
import { usePreferences } from '../lib/preferences.ts';
import { formatBytes } from '../lib/storage.ts';
import type { PhotoItem } from '../lib/usePhotos.ts';
import { parsePhotoFields } from '../lib/validation.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { CameraCapture } from './CameraCapture.tsx';

/** Nytt tillfälle (uppgifter → framifrån → profil) eller en saknad vinkel i ett befintligt. */
export type PhotoFlowMode =
  { kind: 'new' } | { kind: 'add'; session: PhotoSession; angle: CaptureAngle };

type Step = 'details' | CaptureAngle | 'done';

interface Taken {
  id: string;
  url: string;
}

function hintFor(angle: CaptureAngle, side: ProfileSide): string {
  return angle === 'fram'
    ? 'Stå rakt mot kameran med armarna en bit ut från kroppen. Samma plats, ljus och avstånd varje gång gör bilderna lätta att jämföra.'
    : `Vänd ${side === 'vanster' ? 'vänster' : 'höger'} sida mot kameran och låt armarna hänga längs sidorna.`;
}

interface PhotoSessionFlowProps {
  mode: PhotoFlowMode;
  weights: readonly WeightEntry[];
  /** Alla bilder – spökbilden väljs härifrån. */
  photos: readonly PhotoItem[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}

/**
 * Guiden för ett fototillfälle i en panel: datum, vikt (förifylld från trendvikten) och
 * anteckning, sedan vinkel för vinkel. Varje steg kan hoppas över. Bilden tas med den
 * egna kameravyn eller, om getUserMedia saknas eller nekas, med filväljaren; galleriet
 * går alltid att välja. Tillfället sparas först när den första bilden sparas.
 */
export function PhotoSessionFlow({
  mode,
  weights,
  photos,
  onChanged,
  onClose,
}: PhotoSessionFlowProps) {
  const { prefs } = usePreferences();
  const steps: readonly Step[] =
    mode.kind === 'new' ? ['details', ...CAPTURE_ANGLES, 'done'] : [mode.angle, 'done'];
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex] ?? 'done';

  const [date, setDate] = useState(todayIso);
  const [weight, setWeight] = useState(() => trendWeightText(weights, todayIso()));
  const [note, setNote] = useState('');
  const [session, setSession] = useState<PhotoSession | null>(
    mode.kind === 'add' ? mode.session : null,
  );
  const [sessionSaved, setSessionSaved] = useState(mode.kind === 'add');
  const [taken, setTaken] = useState<Partial<Record<CaptureAngle, Taken>>>({});
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Förhandsbilderna frigörs när panelen stängs.
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const canCamera = cameraSupported() && cameraError === null;
  const angleSteps = steps.filter((s): s is CaptureAngle => s !== 'details' && s !== 'done');

  function next() {
    setError(null);
    setStatus(null);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function handleDetails(event: SyntheticEvent) {
    event.preventDefault();
    const fields = parsePhotoFields({ date, weight, note });
    if (!fields.ok) {
      setError(fields.error);
      return;
    }
    const draft: PhotoSession = {
      id: session?.id ?? newId(),
      createdAt: session?.createdAt ?? Date.now(),
      ...fields.value,
    };
    setSession(draft);
    next();
  }

  async function save(file: Blob, angle: CaptureAngle) {
    if (!session) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const image = await compressImage(file);
      if (!sessionSaved) {
        await putPhotoSession(session);
        setSessionSaved(true);
      }
      const photo: PhotoEntry = {
        id: newId(),
        sessionId: session.id,
        date: session.date,
        angle,
        blob: image.blob,
        mimeType: image.blob.type,
        createdAt: Date.now(),
        width: image.width,
        height: image.height,
      };
      if (angle === 'profil') photo.side = prefs.profileSide;
      await putPhoto(photo);
      // En ny bild i samma steg ersätter den förra ("ta om").
      const previous = taken[angle];
      if (previous) await deletePhoto(previous.id);
      const url = URL.createObjectURL(image.blob);
      urls.current.push(url);
      setTaken((prev) => ({ ...prev, [angle]: { id: photo.id, url } }));
      setCameraOpen(false);
      setStatus(`Bilden är sparad (${formatBytes(image.blob.size)}).`);
      await onChanged();
    } catch {
      setError('Kunde inte läsa bilden. Prova en JPEG-, PNG- eller WebP-bild.');
    } finally {
      setBusy(false);
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>, angle: CaptureAngle) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Tillåt att samma fil väljs igen.
    input.value = '';
    if (file) void save(file, angle);
  }

  const title =
    mode.kind === 'new'
      ? 'Nytt fototillfälle'
      : `Lägg till ${ANGLE_LABELS[mode.angle].toLowerCase()}`;
  const savedCount = Object.keys(taken).length;

  return (
    <BottomSheet title={title} onClose={onClose}>
      {step === 'details' && (
        <form className="form" onSubmit={handleDetails} noValidate>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Datum</span>
              <input
                className="input"
                type="date"
                value={date}
                max={todayIso()}
                onChange={(e) => {
                  setDate(e.target.value);
                  setWeight(trendWeightText(weights, e.target.value));
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Vikt (kg, valfri)</span>
              <input
                className="input"
                inputMode="decimal"
                autoComplete="off"
                value={weight}
                aria-describedby="flow-weight-note"
                onChange={(e) => {
                  setWeight(e.target.value);
                }}
              />
            </label>
          </div>
          <p className="muted form-note" id="flow-weight-note">
            Vikten förifylls med trendvikten den dagen.
          </p>
          <label className="field">
            <span className="field-label">Anteckning (valfri)</span>
            <textarea
              className="input textarea"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button">
            Börja
          </button>
        </form>
      )}

      {step !== 'details' && step !== 'done' && (
        <div className="form flow-step" data-testid={`flow-step-${step}`}>
          {angleSteps.length > 1 && (
            <p className="flow-count">
              Steg {formatInt(angleSteps.indexOf(step) + 1)} av {formatInt(angleSteps.length)}
            </p>
          )}
          <h3 className="flow-title">
            {ANGLE_LABELS[step]}
            {step === 'profil' &&
              ` (${prefs.profileSide === 'vanster' ? 'vänster' : 'höger'} sida)`}
          </h3>
          <p className="muted form-note">{hintFor(step, prefs.profileSide)}</p>
          {taken[step] && (
            <img
              className="flow-preview"
              src={taken[step].url}
              alt={`Sparad bild ${ANGLE_LABELS[step].toLowerCase()}`}
            />
          )}
          {cameraError && (
            <p className="form-error" role="alert">
              {cameraError}
            </p>
          )}
          <div className="flow-actions">
            {canCamera ? (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setCameraOpen(true);
                }}
              >
                {taken[step] ? 'Ta om med kameran' : 'Öppna kameran'}
              </button>
            ) : (
              <label className="button file-button" aria-disabled={busy}>
                {taken[step] ? 'Ta om' : 'Ta foto'}
                <input
                  className="file-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={busy}
                  onChange={(e) => {
                    handleFile(e, step);
                  }}
                />
              </label>
            )}
            <label className="button button-secondary file-button" aria-disabled={busy}>
              Välj från galleriet
              <input
                className="file-input"
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(e) => {
                  handleFile(e, step);
                }}
              />
            </label>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={next}
            >
              {taken[step] ? 'Nästa' : 'Hoppa över'}
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="form-ok" role="status">
            {busy ? 'Komprimerar bilden…' : status}
          </p>
          <p className="muted form-note">
            Bilden förminskas till max 1080 px och sparas utan plats- och kamerainformation (EXIF).
          </p>
        </div>
      )}

      {step === 'done' && (
        <div className="form" data-testid="flow-done">
          <p className="flow-summary" role="status">
            {savedCount === 0
              ? 'Inga bilder togs – inget tillfälle sparades.'
              : `Tillfället ${formatDate(session?.date ?? date)} är sparat med ${
                  savedCount === 1 ? '1 ny bild' : `${formatInt(savedCount)} nya bilder`
                }.`}
          </p>
          {savedCount > 0 && (
            <ul className="flow-thumbs">
              {angleSteps.map((angle) => {
                const photo = taken[angle];
                return photo ? (
                  <li key={angle}>
                    <img src={photo.url} alt={`Sparad bild ${ANGLE_LABELS[angle].toLowerCase()}`} />
                    <span>{ANGLE_LABELS[angle]}</span>
                  </li>
                ) : null;
              })}
            </ul>
          )}
          <button type="button" className="button" onClick={onClose}>
            Klar
          </button>
        </div>
      )}

      {cameraOpen && step !== 'details' && step !== 'done' && (
        <CameraCapture
          title={ANGLE_LABELS[step]}
          hint={hintFor(step, prefs.profileSide)}
          ghost={pickGhost(photos, step, prefs.profileSide, session?.id)}
          busy={busy}
          onCapture={(blob) => void save(blob, step)}
          onFile={(file) => void save(file, step)}
          onUnavailable={(message) => {
            setCameraError(message);
            setCameraOpen(false);
          }}
          onClose={() => {
            setCameraOpen(false);
          }}
        />
      )}
    </BottomSheet>
  );
}
