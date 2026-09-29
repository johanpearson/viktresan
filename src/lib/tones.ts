/**
 * Färgtoner i designsystemet: en per datatyp (samma i grafer, kalender, ikoner,
 * ringar och staplar) + protein och fiber. CSS-klassen `tone-<id>` sätter `--tone`.
 */
export type Tone =
  | 'weight'
  | 'food'
  | 'protein'
  | 'fiber'
  | 'drink'
  | 'steps'
  | 'training'
  | 'dose'
  | 'supplement'
  | 'waist'
  | 'mood';

export function toneClass(tone: Tone | undefined): string {
  return tone ? `tone-${tone}` : '';
}
