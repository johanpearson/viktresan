import { useFeatures } from '../lib/features.ts';
import {
  WEEK_ROWS,
  compareValues,
  weekHeadline,
  weekLoggedText,
  type Direction,
  type WeekEntry,
} from '../lib/weekSummary.ts';

const ARROWS: Record<Direction, { symbol: string; text: string }> = {
  up: { symbol: '↑', text: 'högre än veckan innan' },
  down: { symbol: '↓', text: 'lägre än veckan innan' },
  same: { symbol: '→', text: 'samma som veckan innan' },
};

interface WeekSummaryViewProps {
  entry: WeekEntry;
  profile: { startWeightKg: number; goalWeightKg: number } | null;
}

/** Innehållet i en veckosummering: rubrikrad, värden med pilar mot veckan innan. */
export function WeekSummaryView({ entry, profile }: WeekSummaryViewProps) {
  const { filter } = useFeatures();
  const { summary, previous } = entry;
  const rows = filter(WEEK_ROWS)
    .map((row) => ({ row, text: row.text(summary) }))
    .filter((r): r is { row: (typeof WEEK_ROWS)[number]; text: string } => r.text !== null);

  return (
    <>
      <p className="week-headline" data-testid="week-headline">
        {weekHeadline(summary, profile)}
      </p>
      {rows.length > 0 && (
        <dl className="week-rows">
          {rows.map(({ row, text }) => {
            const direction = compareValues(row.value(summary), row.value(previous), row.tolerance);
            const arrow = direction ? ARROWS[direction] : null;
            return (
              <div className="week-row" key={row.id} data-testid={`week-${row.id}`}>
                <dt>{row.label}</dt>
                <dd>
                  <span>{text}</span>
                  {arrow && (
                    <span className="week-arrow" data-direction={direction}>
                      <span aria-hidden="true">{arrow.symbol}</span>
                      <span className="visually-hidden">, {arrow.text}</span>
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className="muted hero-meta">{weekLoggedText(summary)}</p>
    </>
  );
}
