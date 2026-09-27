/**
 * Streckkodsskannerns kameralogik: ljusnivå i bilden och vad kameran kan (ficklampa,
 * zoom, fokus). Rena funktioner – komponenten `BarcodeScanner` sköter strömmen.
 */

/** Genomsnittlig ljushet 0–255 (Rec. 601-luma) i RGBA-data; var fjärde pixel räcker. */
export function averageLuma(data: ArrayLike<number>, step = 4): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 2 < data.length; i += 4 * step) {
    sum += 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

/** Under detta räknas bilden som mörk … */
export const DARK_LUMA = 45;
/** … och först över detta som ljus igen, så att tipset inte blinkar av och på. */
export const LIGHT_LUMA = 65;
/** Så många mätningar i rad krävs innan tipset visas (en skugga ska inte räcka). */
export const DARK_SAMPLES = 2;

export interface LightState {
  dark: boolean;
  /** Mörka mätningar i rad. */
  darkRun: number;
}

export const INITIAL_LIGHT: LightState = { dark: false, darkRun: 0 };

/** Nästa ljusläge efter en mätning (hysteres + krav på flera mörka mätningar i rad). */
export function nextLight(state: LightState, luma: number): LightState {
  if (luma < DARK_LUMA) {
    const darkRun = state.darkRun + 1;
    return { dark: state.dark || darkRun >= DARK_SAMPLES, darkRun };
  }
  if (luma > LIGHT_LUMA) return INITIAL_LIGHT;
  // Mellan gränserna: behåll läget.
  return { dark: state.dark, darkRun: 0 };
}

export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

export interface CameraFeatures {
  torch: boolean;
  zoom: ZoomRange | null;
  /** Tryck för fokus: en punkt (pointsOfInterest) eller engångsfokus. */
  focus: boolean;
}

/** Kapaciteter som inte finns i TypeScripts DOM-typer ännu. */
export interface ExtendedCapabilities {
  torch?: boolean;
  zoom?: { min?: number; max?: number; step?: number };
  focusMode?: string[];
  pointsOfInterest?: unknown;
}

export function cameraFeatures(
  capabilities: ExtendedCapabilities | null | undefined,
): CameraFeatures {
  const caps = capabilities ?? {};
  const z = caps.zoom;
  const zoom =
    z && typeof z.min === 'number' && typeof z.max === 'number' && z.max > z.min
      ? { min: z.min, max: z.max, step: typeof z.step === 'number' && z.step > 0 ? z.step : 0.1 }
      : null;
  const modes = Array.isArray(caps.focusMode) ? caps.focusMode : [];
  return {
    torch: caps.torch === true,
    zoom,
    focus: modes.includes('single-shot') || modes.includes('manual') || 'pointsOfInterest' in caps,
  };
}

/** Tryckpunkt i videon som andel 0–1 (för pointsOfInterest). */
export function pointOfInterest(
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x: clamp((x - rect.left) / (rect.width || 1)),
    y: clamp((y - rect.top) / (rect.height || 1)),
  };
}
