import { formatGrams } from '../lib/format.ts';
import { macroShares, type Nutrients } from '../lib/nutrition.ts';

const MACROS = [
  { key: 'protein', label: 'Protein', grams: (n: Nutrients) => n.proteinG },
  { key: 'carbs', label: 'Kolhydrater', grams: (n: Nutrients) => n.carbsG },
  { key: 'fat', label: 'Fett', grams: (n: Nutrients) => n.fatG },
] as const;

/** Enkel makrostapel: andel av energin från protein, kolhydrater och fett. */
export function MacroBar({ totals }: { totals: Nutrients }) {
  const shares = macroShares(totals);
  const percent = (v: number) => Math.round(v * 100);
  const description = MACROS.map((m) => `${m.label} ${percent(shares[m.key])} %`).join(', ');
  return (
    <div className="macros">
      <div className="macro-bar" role="img" aria-label={`Energifördelning: ${description}`}>
        {MACROS.map((m) => (
          // Bredden sätts via CSSOM (React-style) och omfattas inte av CSP:ns style-src.
          <span
            key={m.key}
            className={`macro-segment macro-${m.key}`}
            style={{ width: `${shares[m.key] * 100}%` }}
          />
        ))}
      </div>
      <dl className="macro-legend" data-testid="macros">
        {MACROS.map((m) => (
          <div key={m.key} className="macro-item">
            <dt>
              <span className={`macro-dot macro-${m.key}`} aria-hidden="true" />
              {m.label}
            </dt>
            <dd>{formatGrams(Math.round(m.grams(totals)))}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
