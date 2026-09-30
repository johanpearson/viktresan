/**
 * Näringsetiketter (Proteinrik, Fiberrik, Energisnål) enligt EU:s näringspåståenden –
 * reglerna och källan finns i `src/data/nutritionClaims.ts`. Rena funktioner utan I/O.
 *
 * Ingen etikett när underlaget saknas: utan fiberdata ingen "Fiberrik", utan känt protein
 * eller energi ingen "Proteinrik", utan känd energi ingen "Energisnål".
 */
import {
  CLAIM_IDS,
  FIBER_RICH_G_PER_100G,
  FIBER_RICH_G_PER_100_KCAL,
  LOW_ENERGY_KCAL_PER_100G,
  LOW_ENERGY_KCAL_PER_100ML,
  PROTEIN_KCAL_PER_G,
  PROTEIN_RICH_ENERGY_SHARE,
  type ClaimId,
} from '../data/nutritionClaims.ts';
import { fiberForItem, type FiberSource } from './fiber.ts';
import { nutritionValue } from './foodNutrition.ts';
import type { FoodItem } from './foodSearch.ts';
import { foodProfile } from './units.ts';

/** Underlaget per 100 g (eller 100 ml för drycker). `null` = värdet saknas. */
export interface ClaimFacts {
  kcal: number | null;
  proteinG: number | null;
  fiberG: number | null;
  /** Dryck (värden per 100 ml) – energigränsen är då 20 kcal. */
  liquid: boolean;
}

/** Små avrundningsfel (t.ex. 0,2 × 4) ska inte flytta ett värde över eller under en gräns. */
const EPSILON = 1e-9;

/** Minst 20 % av energin från protein (4 kcal per gram). */
export function isProteinRich(facts: Pick<ClaimFacts, 'kcal' | 'proteinG'>): boolean {
  const { kcal, proteinG } = facts;
  if (kcal === null || proteinG === null || !(kcal > 0) || !(proteinG > 0)) return false;
  return (proteinG * PROTEIN_KCAL_PER_G) / kcal >= PROTEIN_RICH_ENERGY_SHARE - EPSILON;
}

/** Minst 6 g fiber per 100 g eller minst 3 g fiber per 100 kcal. */
export function isFiberRich(facts: Pick<ClaimFacts, 'kcal' | 'fiberG'>): boolean {
  const { kcal, fiberG } = facts;
  if (fiberG === null || !(fiberG > 0)) return false;
  if (fiberG >= FIBER_RICH_G_PER_100G - EPSILON) return true;
  if (kcal === null || !(kcal > 0)) return false;
  return (fiberG / kcal) * 100 >= FIBER_RICH_G_PER_100_KCAL - EPSILON;
}

/** Högst 40 kcal per 100 g, eller högst 20 kcal per 100 ml för drycker. */
export function isLowEnergy(facts: Pick<ClaimFacts, 'kcal' | 'liquid'>): boolean {
  const { kcal } = facts;
  if (kcal === null || !(kcal >= 0)) return false;
  return kcal <= (facts.liquid ? LOW_ENERGY_KCAL_PER_100ML : LOW_ENERGY_KCAL_PER_100G) + EPSILON;
}

const RULES: Record<ClaimId, (facts: ClaimFacts) => boolean> = {
  proteinrik: isProteinRich,
  fiberrik: isFiberRich,
  energisnal: isLowEnergy,
};

/** Etiketterna som gäller, i visningsordning. */
export function nutritionClaims(facts: ClaimFacts): ClaimId[] {
  return CLAIM_IDS.filter((id) => RULES[id](facts));
}

/** Kategorier som räknas som dryck för energigränsen (per 100 ml). */
const LIQUID_CATEGORIES: ReadonlySet<string> = new Set(['dryck', 'mjolk']);

/**
 * Underlaget för ett livsmedel, en måltid eller ett recept. Värdena gäller per 100 g – för
 * måltider och recept är andelarna (protein av energin, fiber per 100 kcal) desamma per
 * portion. Fiber i måltider och recept räknas ur ingredienserna; saknar någon ingrediens
 * fiberdata är summan i underkant, och en etikett ges bara om den ändå når gränsen.
 * Snabbloggar har inget underlag (`null`).
 */
export function claimFactsFor(item: FoodItem, fiberSource: FiberSource | null): ClaimFacts | null {
  if (item.source === 'snabb') return null;
  const dish = item.source === 'maltid' || item.source === 'recept';
  let fiberG: number | null;
  if (dish) {
    fiberG = fiberSource ? (fiberForItem(item, 100, fiberSource)?.fiberG ?? null) : null;
  } else {
    fiberG = nutritionValue(item, 'fiberG');
  }
  const liquid =
    !dish && (item.per100Unit === 'ml' || LIQUID_CATEGORIES.has(foodProfile(item).category));
  return {
    kcal: nutritionValue(item, 'kcal'),
    proteinG: nutritionValue(item, 'proteinG'),
    fiberG,
    liquid,
  };
}

/** Etiketterna för ett livsmedel (tom lista utan underlag). */
export function claimsFor(item: FoodItem, fiberSource: FiberSource | null): ClaimId[] {
  const facts = claimFactsFor(item, fiberSource);
  return facts ? nutritionClaims(facts) : [];
}
