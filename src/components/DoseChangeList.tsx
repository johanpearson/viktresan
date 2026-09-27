import { formatDate } from '../lib/format.ts';
import { describeDose, type DoseChange } from '../lib/glp1.ts';
import { Card } from './Card.tsx';
import { ListRow } from './ListRow.tsx';

/** Framsteg → Historik: dosbytena som markeras (streckat) i viktgrafen, nyast först. */
export function DoseChangeList({ changes }: { changes: readonly DoseChange[] }) {
  if (changes.length === 0) return null;
  return (
    <Card title="Dosbyten">
      <ul className="list" data-testid="dose-changes">
        {[...changes].reverse().map((c) => (
          <ListRow
            key={`${c.date}-${c.medicationName}-${String(c.doseMg)}`}
            primary={describeDose(c)}
            secondary={c.kind === 'start' ? 'Start' : 'Dosbyte'}
            value={<span className="nowrap">{formatDate(c.date)}</span>}
          />
        ))}
      </ul>
    </Card>
  );
}
