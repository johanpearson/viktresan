import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
  type SyntheticEvent,
} from 'react';
import { normalizeEan } from '../lib/barcode.ts';
import {
  canScan,
  createBarcodeDetector,
  type BarcodeDetectorLike,
} from '../lib/barcodeDetector.ts';
import { cameraErrorMessage, stopStream } from '../lib/camera.ts';
import { haptic } from '../lib/haptics.ts';
import { prefersReducedMotion } from '../lib/motion.ts';
import {
  INITIAL_LIGHT,
  averageLuma,
  cameraFeatures,
  nextLight,
  pointOfInterest,
  type CameraFeatures,
  type ExtendedCapabilities,
  type LightState,
} from '../lib/scanner.ts';

interface BarcodeScannerProps {
  /** En giltig EAN lästes (kamera, bild eller inmatning). Kameran är redan stängd. */
  onEan: (ean: string) => void;
  onClose: () => void;
}

type Mode = 'camera' | 'manual';

type CameraState = { kind: 'starting' } | { kind: 'on' } | { kind: 'error'; message: string };

/** Millisekunder mellan försöken att läsa en streckkod ur videon. */
const SCAN_INTERVAL = 150;
/** Millisekunder mellan ljusmätningarna. */
const LIGHT_INTERVAL = 700;
/** Hur länge bekräftelsen visas innan vyn stängs. */
const CONFIRM_MS = 600;

const NO_FEATURES: CameraFeatures = { torch: false, zoom: null, focus: false };

/** Constraints som inte finns i TypeScripts DOM-typer (torch, zoom, fokuspunkt). */
type AdvancedConstraint = Record<string, unknown>;

function applyAdvanced(track: MediaStreamTrack | null, constraint: AdvancedConstraint) {
  if (!track) return Promise.resolve();
  return track
    .applyConstraints({ advanced: [constraint as MediaTrackConstraintSet] })
    .catch(() => undefined);
}

/** Första giltiga EAN bland de lästa koderna. */
function firstEan(codes: readonly { rawValue: string }[]): string | null {
  for (const code of codes) {
    const ean = normalizeEan(code.rawValue);
    if (ean) return ean;
  }
  return null;
}

/**
 * Streckkodsskanner som modal kameravy (gemensam för Mat, egna måltider och Tillskott):
 * bakre kameran i hög upplösning med BarcodeDetector på bildrutorna, ficklampa, zoom och
 * tryck för fokus när kameran klarar det, och ett tips när bilden är mörk. Vid träff:
 * vibration, kort bekräftelse och kameran stängs direkt. Reserv: skriv in koden eller
 * välj en bild. Kameraströmmen stängs alltid när vyn lämnas.
 */
export function BarcodeScanner({ onEan, onClose }: BarcodeScannerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const callbacks = useRef({ onEan });
  const confirmTimer = useRef<number | undefined>(undefined);
  const [mode, setMode] = useState<Mode>(() => (canScan() ? 'camera' : 'manual'));
  const [camera, setCamera] = useState<CameraState>({ kind: 'starting' });
  const [features, setFeatures] = useState<CameraFeatures>(NO_FEATURES);
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [light, setLight] = useState<LightState>(INITIAL_LIGHT);
  const [focusAt, setFocusAt] = useState<{ x: number; y: number } | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const manualRef = useRef<HTMLInputElement>(null);
  const hasDetector = typeof globalThis !== 'undefined' && 'BarcodeDetector' in globalThis;

  useEffect(() => {
    callbacks.current = { onEan };
  });

  // Stängs vyn under bekräftelsen ska träffen inte användas.
  useEffect(
    () => () => {
      window.clearTimeout(confirmTimer.current);
    },
    [],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  // Inmatningsläget: fokus direkt i fältet (numeriskt tangentbord).
  useEffect(() => {
    if (mode === 'manual') manualRef.current?.focus();
  }, [mode]);

  // Lämnas appen (annan app, skärmen släcks) stängs vyn – och därmed kameran.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        stopRef.current?.();
        dialogRef.current?.close();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /** Träff: stäng kameran direkt, vibrera, visa bekräftelsen en kort stund. */
  function hit(ean: string) {
    stopRef.current?.();
    haptic('success');
    setFound(ean);
    confirmTimer.current = window.setTimeout(
      () => {
        callbacks.current.onEan(ean);
      },
      prefersReducedMotion() ? 0 : CONFIRM_MS,
    );
  }
  const hitRef = useRef(hit);
  useEffect(() => {
    hitRef.current = hit;
  });

  useEffect(() => {
    if (mode !== 'camera') return;
    const detector = createBarcodeDetector();
    detectorRef.current = detector;
    const video = videoRef.current;
    if (!detector || !video) {
      setMode('manual');
      return;
    }
    const state = { active: true };
    const isActive = () => state.active;
    let stream: MediaStream | null = null;
    let scanTimer = 0;
    let lightTimer = 0;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const stop = () => {
      state.active = false;
      window.clearTimeout(scanTimer);
      window.clearInterval(lightTimer);
      if (stream) stopStream(stream);
      stream = null;
      trackRef.current = null;
      video.srcObject = null;
      stopRef.current = null;
    };
    stopRef.current = stop;
    setCamera({ kind: 'starting' });

    const tick = async () => {
      try {
        const ean = firstEan(await detector.detect(video));
        if (ean && state.active) {
          hitRef.current(ean);
          return;
        }
      } catch {
        // Bildrutan var inte redo än – försök igen.
      }
      if (state.active) scanTimer = window.setTimeout(() => void tick(), SCAN_INTERVAL);
    };

    const measure = () => {
      if (!ctx || video.videoWidth === 0) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const luma = averageLuma(ctx.getImageData(0, 0, canvas.width, canvas.height).data, 1);
      setLight((prev) => nextLight(prev, luma));
    };

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then(async (result) => {
        if (!state.active) {
          stopStream(result);
          return;
        }
        stream = result;
        const track = result.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const caps =
          track && typeof track.getCapabilities === 'function'
            ? (track.getCapabilities() as ExtendedCapabilities)
            : null;
        const next = cameraFeatures(caps);
        setFeatures(next);
        if (next.zoom) {
          const settings = track?.getSettings() as { zoom?: number } | undefined;
          setZoom(settings?.zoom ?? next.zoom.min);
        }
        video.srcObject = result;
        await video.play().catch(() => undefined);
        // Vyn kan ha stängts medan videon startade.
        if (!isActive()) return;
        setCamera({ kind: 'on' });
        void tick();
        lightTimer = window.setInterval(measure, LIGHT_INTERVAL);
      })
      .catch((err: unknown) => {
        if (!state.active) return;
        setCamera({ kind: 'error', message: cameraErrorMessage(err, 'scanner') });
      });
    return stop;
  }, [mode]);

  function toggleTorch() {
    const on = !torch;
    setTorch(on);
    void applyAdvanced(trackRef.current, { torch: on });
  }

  function changeZoom(value: number) {
    setZoom(value);
    void applyAdvanced(trackRef.current, { zoom: value });
  }

  function focus(event: PointerEvent<HTMLVideoElement>) {
    if (!features.focus) return;
    const point = pointOfInterest(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    );
    setFocusAt(point);
    void applyAdvanced(trackRef.current, {
      pointsOfInterest: [point],
      focusMode: 'single-shot',
    });
    window.setTimeout(() => {
      setFocusAt(null);
    }, 800);
  }

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const detector = detectorRef.current ?? createBarcodeDetector();
    if (!detector) return;
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const ean = firstEan(await detector.detect(bitmap));
      bitmap.close();
      if (ean) {
        hit(ean);
        return;
      }
    } catch {
      // Behandlas som ingen träff nedan.
    }
    setError('Hittade ingen streckkod i bilden. Prova en skarpare bild eller skriv in siffrorna.');
  }

  function handleManual(event: SyntheticEvent) {
    event.preventDefault();
    const ean = normalizeEan(manual);
    if (!ean) {
      setError('Streckkoden är inte giltig. Den har 8 eller 13 siffror.');
      return;
    }
    setError(null);
    hit(ean);
  }

  const imagePicker = hasDetector && (
    <label className="button button-secondary file-button camera-secondary">
      Välj bild
      <input
        className="file-input"
        type="file"
        accept="image/*"
        onChange={(e) => void handleImage(e)}
      />
    </label>
  );

  return (
    <dialog
      className="camera scanner"
      ref={dialogRef}
      aria-labelledby="scanner-title"
      onClose={() => {
        stopRef.current?.();
        onClose();
      }}
      data-testid="scanner"
    >
      <div className="scanner-header">
        <p className="camera-title" id="scanner-title">
          Skanna streckkod
        </p>
        <button
          type="button"
          className="button button-ghost button-small scanner-close"
          onClick={() => {
            dialogRef.current?.close();
          }}
        >
          Stäng
        </button>
      </div>

      {found !== null ? (
        <div className="scanner-found" role="status" data-testid="scanner-found">
          <span className="scanner-found-icon" aria-hidden="true">
            ✓
          </span>
          <p>
            Streckkod hittad <span className="num">{found}</span>
          </p>
        </div>
      ) : mode === 'camera' ? (
        <>
          <div className="camera-stage scanner-stage">
            <video
              ref={videoRef}
              className="camera-video scanner-video"
              autoPlay
              muted
              playsInline
              aria-label="Kamerabild för streckkodsläsning"
              onPointerDown={focus}
            />
            <span className="scanner-frame" aria-hidden="true" />
            {focusAt && (
              // React-style sätts via CSSOM och omfattas inte av CSP:ns style-src.
              <span
                className="scanner-focus"
                aria-hidden="true"
                style={{ left: `${String(focusAt.x * 100)}%`, top: `${String(focusAt.y * 100)}%` }}
              />
            )}
            {camera.kind === 'on' && light.dark && (
              <p className="scanner-tip" role="status" data-testid="scanner-dark">
                {features.torch && !torch
                  ? 'Mörkt, tänd lampan?'
                  : 'Mörkt – försök där det är ljusare.'}
              </p>
            )}
          </div>
          {camera.kind === 'error' ? (
            <p className="camera-hint" role="alert">
              {camera.message}
            </p>
          ) : (
            <p className="camera-hint" role="status">
              {camera.kind === 'starting'
                ? 'Startar kameran …'
                : features.focus
                  ? 'Håll streckkoden i rutan. Tryck på bilden för att fokusera.'
                  : 'Håll streckkoden i rutan.'}
            </p>
          )}
          <div className="camera-controls">
            {(features.torch || features.zoom) && (
              <div className="scanner-tools">
                {features.torch && (
                  <button
                    type="button"
                    className="button button-secondary camera-secondary"
                    aria-pressed={torch}
                    onClick={toggleTorch}
                  >
                    {torch ? 'Släck lampan' : 'Tänd lampan'}
                  </button>
                )}
                {features.zoom && zoom !== null && (
                  <label className="scanner-zoom-field">
                    <span className="nowrap">Zoom {zoom.toFixed(1).replace('.', ',')}×</span>
                    <input
                      className="camera-opacity scanner-zoom"
                      type="range"
                      min={features.zoom.min}
                      max={features.zoom.max}
                      step={features.zoom.step}
                      value={zoom}
                      aria-valuetext={`${zoom.toFixed(1).replace('.', ',')}×`}
                      onChange={(e) => {
                        changeZoom(Number(e.target.value));
                      }}
                    />
                  </label>
                )}
              </div>
            )}
            <div className="camera-actions">
              <button
                type="button"
                className="button button-secondary camera-secondary"
                onClick={() => {
                  setError(null);
                  setMode('manual');
                }}
              >
                Skriv in streckkod
              </button>
              {imagePicker}
            </div>
          </div>
        </>
      ) : (
        <form className="scanner-manual" onSubmit={handleManual} noValidate>
          {!hasDetector && (
            <p className="camera-hint" data-testid="scanner-unsupported">
              Den här webbläsaren kan inte läsa streckkoder med kameran. Skriv in siffrorna under
              streckkoden i stället.
            </p>
          )}
          <label className="field">
            <span className="field-label">Streckkod (EAN)</span>
            <input
              className="input"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="search"
              autoComplete="off"
              maxLength={14}
              ref={manualRef}
              value={manual}
              onChange={(e) => {
                setManual(e.target.value.replace(/[^\d\s]/g, ''));
              }}
            />
          </label>
          <button type="submit" className="button">
            Slå upp
          </button>
          <div className="camera-actions">
            {canScan() && (
              <button
                type="button"
                className="button button-secondary camera-secondary"
                onClick={() => {
                  setError(null);
                  setMode('camera');
                }}
              >
                Använd kameran
              </button>
            )}
            {imagePicker}
          </div>
        </form>
      )}
      {error && (
        <p className="scanner-error" role="alert">
          {error}
        </p>
      )}
      <p className="camera-note">
        Streckkoden söks först bland det du sparat, sedan i Open Food Facts. Bara streckkoden
        skickas.
      </p>
    </dialog>
  );
}
