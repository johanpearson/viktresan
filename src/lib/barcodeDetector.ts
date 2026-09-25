/**
 * Minimal typning av BarcodeDetector (Shape Detection API), som saknas i
 * TypeScripts DOM-typer. Finns i Chrome på Android; saknas i t.ex. Firefox.
 */
export interface DetectedBarcode {
  rawValue: string;
  format: string;
}

export interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement | ImageBitmap): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export const PRODUCT_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** En detektor för produktstreckkoder, eller `null` om API:t saknas. */
export function createBarcodeDetector(): BarcodeDetectorLike | null {
  const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: PRODUCT_FORMATS });
  } catch {
    return null;
  }
}

export function canScan(): boolean {
  return (
    'BarcodeDetector' in globalThis &&
    typeof navigator !== 'undefined' &&
    // mediaDevices saknas utanför säkra kontexter (http).
    'mediaDevices' in navigator &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}
