import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { normalizeEan } from '../lib/barcode.ts';
import { canScan, createBarcodeDetector } from '../lib/barcodeDetector.ts';

interface BarcodeScannerProps {
  onEan: (ean: string) => void;
  onClose: () => void;
  /** Ett uppslag pågår. */
  busy: boolean;
}

type CameraState = 'off' | 'starting' | 'on' | 'unsupported' | 'error';

/** Millisekunder mellan försöken att läsa en streckkod ur videon. */
const SCAN_INTERVAL = 200;

/**
 * Streckkodsskanning med kameran (BarcodeDetector) och manuell inmatning som
 * reserv. Bilderna lämnar aldrig enheten – bara den lästa koden används.
 */
export function BarcodeScanner({ onEan, onClose, busy }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [camera, setCamera] = useState<CameraState>(() => (canScan() ? 'off' : 'unsupported'));
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      stopRef.current?.();
    },
    [],
  );

  async function startCamera() {
    const detector = createBarcodeDetector();
    const video = videoRef.current;
    if (!detector || !video) {
      setCamera('unsupported');
      return;
    }
    setCamera('starting');
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch {
      setCamera('error');
      setError('Kameran kunde inte startas. Ange streckkoden för hand.');
      return;
    }
    // Objekt i stället för en boolesk variabel: flaggan ändras i en annan closure.
    const state = { stopped: false };
    let timer = 0;
    const stop = () => {
      state.stopped = true;
      window.clearTimeout(timer);
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
      stopRef.current = null;
    };
    stopRef.current = stop;
    video.srcObject = stream;
    await video.play().catch(() => undefined);
    setCamera('on');

    // stop() rensar timern, så en ny runda startar bara medan kameran är på.
    const tick = async () => {
      try {
        for (const code of await detector.detect(video)) {
          const ean = normalizeEan(code.rawValue);
          if (ean) {
            stop();
            setCamera('off');
            onEan(ean);
            return;
          }
        }
      } catch {
        // Bildrutan var inte redo än – försök igen.
      }
      // Kameran kan ha stoppats medan detect() pågick.
      if (!state.stopped) timer = window.setTimeout(() => void tick(), SCAN_INTERVAL);
    };
    void tick();
  }

  function stopCamera() {
    stopRef.current?.();
    setCamera('off');
  }

  function handleManual(event: SyntheticEvent) {
    event.preventDefault();
    const ean = normalizeEan(manual);
    if (!ean) {
      setError('Streckkoden är inte giltig. Den har 8 eller 13 siffror.');
      return;
    }
    setError(null);
    onEan(ean);
  }

  return (
    <section className="card form" aria-labelledby="scan-title">
      <div className="card-header">
        <h2 className="card-title" id="scan-title">
          Skanna streckkod
        </h2>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => {
            stopCamera();
            onClose();
          }}
        >
          Stäng
        </button>
      </div>
      <video
        ref={videoRef}
        className="scanner-video"
        hidden={camera !== 'on' && camera !== 'starting'}
        muted
        playsInline
        aria-label="Kamerabild för streckkodsläsning"
      />
      {camera === 'off' && (
        <button type="button" className="button" onClick={() => void startCamera()}>
          Starta kameran
        </button>
      )}
      {camera === 'on' && (
        <>
          <p className="form-note" role="status">
            Håll streckkoden framför kameran.
          </p>
          <button type="button" className="button button-secondary" onClick={stopCamera}>
            Stoppa kameran
          </button>
        </>
      )}
      {camera === 'unsupported' && (
        <p className="form-note muted" data-testid="scanner-unsupported">
          Den här webbläsaren kan inte läsa streckkoder med kameran. Skriv in siffrorna under
          streckkoden i stället.
        </p>
      )}
      <form className="scan-manual" onSubmit={handleManual} noValidate>
        <label className="field">
          <span className="field-label">Streckkod (EAN)</span>
          <input
            className="input"
            inputMode="numeric"
            autoComplete="off"
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
            }}
          />
        </label>
        <button type="submit" className="button button-secondary" disabled={busy}>
          Slå upp
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="form-note muted">
        Okända streckkoder slås upp i Open Food Facts. Bara streckkoden skickas.
      </p>
    </section>
  );
}
