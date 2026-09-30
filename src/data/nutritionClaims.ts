/**
 * Näringsetiketterna i matloggningen (Proteinrik, Fiberrik, Energisnål) enligt EU:s
 * näringspåståenden. Reglerna används för sökträffar, Senaste, Favoriter, livsmedlets
 * detaljer, logg-sheeten och egna måltider/recept – se `src/lib/claims.ts`.
 *
 * Källa: Europaparlamentets och rådets förordning (EG) nr 1924/2006 om närings- och
 * hälsopåståenden om livsmedel, bilagan "Näringspåståenden och villkor för dem".
 * - "Låg energihalt": högst 40 kcal (170 kJ) per 100 g för fasta livsmedel, högst
 *   20 kcal (80 kJ) per 100 ml för flytande.
 * - "Hög fiberhalt": minst 6 g fiber per 100 g eller minst 3 g fiber per 100 kcal.
 * - "Högt proteininnehåll": minst 20 % av livsmedlets energivärde kommer från protein.
 *
 * Appen gör inga påståenden om hälsa – etiketterna är en snabb orientering. Ett
 * värde som saknas ger ingen etikett.
 */
import type { Tone } from '../lib/tones.ts';

export type ClaimId = 'proteinrik' | 'fiberrik' | 'energisnal';

export const CLAIM_SOURCE = 'Förordning (EG) nr 1924/2006, bilagan (näringspåståenden)';
export const CLAIM_SOURCE_URL =
  'https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:32006R1924';

/** Energi per gram protein (förordning (EU) nr 1169/2011, bilaga XIV). */
export const PROTEIN_KCAL_PER_G = 4;
/** Proteinrik: minst så stor andel av energin kommer från protein. */
export const PROTEIN_RICH_ENERGY_SHARE = 0.2;
/** Fiberrik: minst så här många gram fiber per 100 g … */
export const FIBER_RICH_G_PER_100G = 6;
/** … eller minst så här många gram fiber per 100 kcal. */
export const FIBER_RICH_G_PER_100_KCAL = 3;
/** Energisnål: högst så här många kcal per 100 g (fast livsmedel) … */
export const LOW_ENERGY_KCAL_PER_100G = 40;
/** … eller per 100 ml (dryck). */
export const LOW_ENERGY_KCAL_PER_100ML = 20;

export interface ClaimRule {
  id: ClaimId;
  /** Etikettens text. */
  label: string;
  /** Datatypens färg i designsystemet (ram på etiketten). */
  tone: Extract<Tone, 'protein' | 'fiber' | 'food'>;
  /** Villkoret i klartext (Inställningar, skärmläsare). */
  rule: string;
}

/** I den ordning etiketterna visas. */
export const CLAIM_RULES: readonly ClaimRule[] = [
  {
    id: 'proteinrik',
    label: 'Proteinrik',
    tone: 'protein',
    rule: 'Minst 20 % av energin kommer från protein.',
  },
  {
    id: 'fiberrik',
    label: 'Fiberrik',
    tone: 'fiber',
    rule: 'Minst 6 g fiber per 100 g eller minst 3 g fiber per 100 kcal.',
  },
  {
    id: 'energisnal',
    label: 'Energisnål',
    tone: 'food',
    rule: 'Högst 40 kcal per 100 g, eller högst 20 kcal per 100 ml för drycker.',
  },
];

export const CLAIM_IDS: readonly ClaimId[] = CLAIM_RULES.map((c) => c.id);

export function claimRule(id: ClaimId): ClaimRule {
  const rule = CLAIM_RULES.find((c) => c.id === id);
  if (!rule) throw new Error(`Okänd etikett: ${id}`);
  return rule;
}

export function isClaimId(value: unknown): value is ClaimId {
  return typeof value === 'string' && (CLAIM_IDS as readonly string[]).includes(value);
}
