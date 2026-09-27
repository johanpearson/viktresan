/**
 * Lätt haptisk återkoppling via navigator.vibrate. Av när användaren stängt av
 * "Vibration" (Inställningar → Visning), vid prefers-reduced-motion och där API:t
 * saknas (t.ex. iOS Safari).
 */
import { prefersReducedMotion } from './motion.ts';
import { currentPreferences } from './preferences.ts';

/** Mönster i millisekunder: `success` vid spara/klar, `light` vid mindre val. */
const PATTERNS = {
  success: [12],
  light: [6],
} as const;

export type HapticKind = keyof typeof PATTERNS;

export function haptic(kind: HapticKind = 'success'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (!currentPreferences().haptics || prefersReducedMotion()) return;
  try {
    navigator.vibrate([...PATTERNS[kind]]);
  } catch {
    // Vissa webbläsare kastar utan användargest – återkopplingen är bara en bonus.
  }
}
