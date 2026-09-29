/**
 * Referensvärden för fiberintag per dag för vuxna.
 *
 * Källa: Nordiska näringsrekommendationer 2023 (NNR 2023), Nordiska ministerrådet –
 * kapitlet om kostfiber: minst 25 g per dag för kvinnor och minst 35 g per dag för män
 * (motsvarar ungefär 3 g per MJ). https://pub.norden.org/nord2023-003/
 *
 * Saknas kön i profilen används mittvärdet 30 g (samma som i `src/data/nutrients.ts`).
 * Värdena gäller friska vuxna och är inga personliga ordinationer.
 */
import type { Sex } from '../lib/energy.ts';

export const FIBER_REFERENCE_G: Readonly<Record<Sex, number>> = { man: 35, kvinna: 25 };

/** Kön saknas: mitt emellan. */
export const FIBER_REFERENCE_UNKNOWN_SEX_G = 30;

export const FIBER_REFERENCE_SOURCE = 'Nordiska näringsrekommendationer 2023 (NNR 2023)';
