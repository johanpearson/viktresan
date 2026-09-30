import { claimRule, type ClaimId } from '../data/nutritionClaims.ts';
import { usePreferences } from '../lib/preferences.ts';

const TEST_IDS: Record<ClaimId, string> = {
  proteinrik: 'protein-rich',
  fiberrik: 'fiber-rich',
  energisnal: 'low-energy',
};

/**
 * Näringsetiketterna (Proteinrik, Fiberrik, Energisnål) i datatypens färg. Etiketter som
 * stängts av i Inställningar → Visning visas inte.
 */
export function ClaimTags({ claims }: { claims: readonly ClaimId[] }) {
  const { prefs } = usePreferences();
  const shown = claims.filter((id) => !prefs.claimsHidden.includes(id));
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((id) => {
        const rule = claimRule(id);
        return (
          <span
            key={id}
            className={`tag tag-claim tag-${rule.tone}`}
            data-testid={TEST_IDS[id]}
            data-claim={id}
          >
            {rule.label}
          </span>
        );
      })}
    </>
  );
}
