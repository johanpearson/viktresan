import { UPPER_LIMITS_SOURCE } from '../data/upperLimits.ts';
import { formatNutrient } from '../lib/format.ts';
import type { UpperLimitWarning } from '../lib/micronutrients.ts';
import { Card } from './Card.tsx';
import { ListRow } from './ListRow.tsx';

interface UpperLimitWarningsProps {
  warnings: readonly UpperLimitWarning[];
  /** "Idag" eller datumet. */
  when: string;
  /** Länk till hela summeringen (på Översikt, där varningen är kortare). */
  href?: string | undefined;
}

/**
 * Saklig varning när intaget av ett näringsämne överstiger EFSA:s övre gränsvärde (UL),
 * med de största bidragskällorna. Visas i Mat → Näring och på Översikt samma dag.
 */
export function UpperLimitWarnings({ warnings, when, href }: UpperLimitWarningsProps) {
  if (warnings.length === 0) return null;
  return (
    <Card title={`Över övre gränsvärdet ${when}`} tone="warning" testId="ul-warning">
      <ul className="list">
        {warnings.map((w) => {
          const sources = (href ? w.top.slice(0, 2) : w.top)
            .map(
              (c) =>
                `${c.name} (${c.source === 'tillskott' ? 'tillskott' : 'mat'}) ${formatNutrient(c.amount, w.unit)}`,
            )
            .join(' · ');
          return (
            <ListRow
              key={w.key}
              testId="ul-warning-row"
              primary={w.label}
              secondary={
                <>
                  {w.limit.appliesTo === 'supplements' ? 'Från tillskott. ' : ''}
                  Störst bidrag: {sources}
                  {w.limit.note && !href && <span className="list-row-note">{w.limit.note}</span>}
                </>
              }
              value={
                <span className="num">
                  {formatNutrient(w.amount, w.unit)} / {formatNutrient(w.limit.ul, w.unit)}
                </span>
              }
            />
          );
        })}
      </ul>
      {!href && (
        <p className="form-note muted">
          Övre gräns per dag för vuxna enligt {UPPER_LIMITS_SOURCE}. Enstaka dagar över gränsen är
          sällan ett problem, men långvarigt högt intag bör undvikas. Rådgör med vården om du har
          ordinerats en hög dos.
        </p>
      )}
      {href && (
        <ul className="list">
          <ListRow primary="Visa näring" chevron href={href} />
        </ul>
      )}
    </Card>
  );
}
