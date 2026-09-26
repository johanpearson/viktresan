import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { cameraErrorMessage, grabFrame, stopStream } from '../lib/camera.ts';
import { formatDate } from '../lib/format.ts';
import {
  GHOST_OPACITY_MAX,
  GHOST_OPACITY_MIN,
  setPreference,
  usePreferences,
} from '../lib/preferences.ts';
import type { PhotoItem } from '../lib/usePhotos.ts';

type Facing = 'environment' | 'user';
type Timer = 0 | 3 | 10;

const TIMERS: readonly { value: Timer; label: string }[] = [
  { value: 0, label: 'Av' },
  { value: 3, label: '3 s' },
  { value: 10, label: '10 s' },
];

interface CameraCaptureProps {
  /** Vinkelns namn, t.ex. "Framifrån". */
  title: string;
  hint: string;
  /** Senaste bilden i samma vinkel, visas som halvgenomskinligt överlägg. */
  ghost: PhotoItem | null;
  busy: boolean;
  onCapture: (image: Blob) => void;
  /** En bild vald från galleriet i stället. */
  onFile: (file: File) => void;
  /** getUserMedia saknas eller nekades – föräldern visar filväljaren. */
  onUnavailable: (message: string) => void;
  onClose: () => void;
}

/**
 * Egen kameravy (getUserMedia) som modal <dialog>: bakre/främre kamera, självutlösare
 * och spökbild. Bilden tas från videon via canvas; föräldern komprimerar och rensar den
 * precis som en vald fil. Främre kameran visas spegelvänd (även spökbilden) men sparas
 * som kameran ser den, så att alla bilder har samma orientering.
 */
export function CameraCapture({
  title,
  hint,
  ghost,
  busy,
  onCapture,
  onFile,
  onUnavailable,
  onClose,
}: CameraCaptureProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<Facing>('environment');
  const [ready, setReady] = useState(false);
  const [timer, setTimer] = useState<Timer>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimer = useRef<number | undefined>(undefined);
  const { prefs } = usePreferences();
  // Senaste callbackarna utan att starta om kameran när föräldern renderar om.
  const callbacks = useRef({ onCapture, onUnavailable });

  useEffect(() => {
    callbacks.current = { onCapture, onUnavailable };
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      })
      .then((result) => {
        if (!active) {
          stopStream(result);
          return;
        }
        stream = result;
        const video = videoRef.current;
        if (video) {
          video.srcObject = result;
          video.play().catch(() => {
            // Autoplay med muted/playsInline ska gå; annars startar videon vid tryck.
          });
        }
      })
      .catch((error: unknown) => {
        if (active) callbacks.current.onUnavailable(cameraErrorMessage(error));
      });
    return () => {
      active = false;
      if (stream) stopStream(stream);
    };
  }, [facing]);

  useEffect(
    () => () => {
      window.clearInterval(countdownTimer.current);
    },
    [],
  );

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    void grabFrame(video).then((blob) => {
      if (blob) callbacks.current.onCapture(blob);
    });
  }

  function stopCountdown() {
    window.clearInterval(countdownTimer.current);
    countdownTimer.current = undefined;
    setCountdown(null);
  }

  function handleShutter() {
    if (countdown !== null) {
      stopCountdown();
      return;
    }
    if (timer === 0) {
      capture();
      return;
    }
    let left: number = timer;
    setCountdown(left);
    countdownTimer.current = window.setInterval(() => {
      left -= 1;
      if (left > 0) {
        setCountdown(left);
        return;
      }
      stopCountdown();
      capture();
    }, 1000);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) onFile(file);
  }

  const showGhost = ghost !== null && prefs.ghostEnabled;
  const mirrored = facing === 'user';

  return (
    <dialog
      className="camera"
      ref={dialogRef}
      aria-labelledby="camera-title"
      aria-describedby="camera-hint"
      onClose={onClose}
      data-testid="camera"
    >
      <p className="camera-title" id="camera-title">
        {title}
      </p>
      <p className="camera-hint" id="camera-hint">
        {hint}
      </p>
      <div className={mirrored ? 'camera-stage camera-mirrored' : 'camera-stage'}>
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          muted
          playsInline
          aria-label="Kamerabild"
          onLoadedData={(e) => {
            setReady(e.currentTarget.videoWidth > 0);
          }}
        />
        {showGhost && (
          // React-style sätts via CSSOM och omfattas inte av CSP:ns style-src.
          <img
            className="camera-ghost"
            src={ghost.url}
            alt=""
            data-testid="camera-ghost"
            data-photo-id={ghost.id}
            style={{ opacity: prefs.ghostOpacity }}
          />
        )}
        {countdown !== null && (
          <span className="camera-countdown" aria-hidden="true">
            {countdown}
          </span>
        )}
      </div>
      <p className="visually-hidden" aria-live="assertive">
        {countdown ?? ''}
      </p>

      <div className="camera-controls">
        <div className="segmented" role="group" aria-label="Självutlösare">
          {TIMERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="segmented-button"
              aria-pressed={timer === option.value}
              onClick={() => {
                setTimer(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {ghost ? (
          <div className="camera-ghost-controls">
            <label className="camera-check">
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={prefs.ghostEnabled}
                onChange={(e) => void setPreference('ghostEnabled', e.target.checked)}
              />
              <span>Spökbild ({formatDate(ghost.date)})</span>
            </label>
            <input
              className="camera-opacity"
              type="range"
              min={GHOST_OPACITY_MIN * 100}
              max={GHOST_OPACITY_MAX * 100}
              step={5}
              value={Math.round(prefs.ghostOpacity * 100)}
              disabled={!prefs.ghostEnabled}
              aria-label="Spökbildens opacitet"
              aria-valuetext={`${String(Math.round(prefs.ghostOpacity * 100))} %`}
              onChange={(e) => void setPreference('ghostOpacity', Number(e.target.value) / 100)}
            />
          </div>
        ) : (
          <p className="camera-note">
            Ingen tidigare bild i den här vinkeln – spökbilden visas från nästa tillfälle.
          </p>
        )}

        <div className="camera-actions">
          <button
            type="button"
            className="button button-secondary camera-secondary"
            onClick={() => {
              stopCountdown();
              setReady(false);
              setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
            }}
          >
            {facing === 'environment' ? 'Främre kamera' : 'Bakre kamera'}
          </button>
          <button
            type="button"
            className="button camera-shutter"
            disabled={!ready || busy}
            onClick={handleShutter}
          >
            {busy ? 'Sparar…' : countdown !== null ? 'Avbryt nedräkning' : 'Ta bild'}
          </button>
        </div>
        <div className="camera-actions">
          <label
            className="button button-secondary file-button camera-secondary"
            aria-disabled={busy}
          >
            Välj från galleriet
            <input
              className="file-input"
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={handleFile}
            />
          </label>
          <button
            type="button"
            className="button button-secondary camera-secondary"
            onClick={() => {
              dialogRef.current?.close();
            }}
          >
            Avbryt
          </button>
        </div>
      </div>
    </dialog>
  );
}
