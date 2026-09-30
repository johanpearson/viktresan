/** Proteinmål. Rena funktioner utan I/O. (Etiketten Proteinrik: `claims.ts`.) */

/** Standardfaktor: gram protein per kg målvikt. */
export const DEFAULT_PROTEIN_FACTOR = 1.6;
export const PROTEIN_FACTOR_MIN = 1.2;
export const PROTEIN_FACTOR_MAX = 2.0;

/** Valbara faktorer i Inställningar (1,2–2,0 i steg om 0,1). */
export const PROTEIN_FACTORS: readonly number[] = Array.from(
  { length: Math.round((PROTEIN_FACTOR_MAX - PROTEIN_FACTOR_MIN) * 10) + 1 },
  (_, i) => Math.round((PROTEIN_FACTOR_MIN + i / 10) * 10) / 10,
);

export function isValidProteinFactor(value: unknown): value is number {
  return typeof value === 'number' && PROTEIN_FACTORS.includes(value);
}

/**
 * Dagligt proteinmål i gram = faktor × målvikt, avrundat till hela gram.
 * Ogiltig faktor → standardfaktorn. `null` utan rimlig målvikt.
 */
export function proteinGoalG(goalWeightKg: number, factor?: number): number | null {
  if (!(goalWeightKg > 0)) return null;
  const f = isValidProteinFactor(factor) ? factor : DEFAULT_PROTEIN_FACTOR;
  return Math.round(f * goalWeightKg);
}

/** Proteinmålet ur profilen (`proteinFactor` saknas → 1,6). */
export function proteinGoalFor(
  profile: { goalWeightKg: number; proteinFactor?: number } | null,
): number | null {
  return profile ? proteinGoalG(profile.goalWeightKg, profile.proteinFactor) : null;
}
