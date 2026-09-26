import { formatDate } from '../lib/format.ts';
import { describeDose, type DoseChange } from '../lib/glp1.ts';

/** Framsteg → Historik: dosbytena som markeras i viktgrafen, nyast först. */
export function DoseChangeList({ changes }: { changes: readonly DoseChange[] }) {
  if (changes.length === 0) return null;
  return (
    <section className="card" aria-labelledby="dose-changes-title">
      <h2 className="card-title" id="dose-changes-title">
        Dosbyten
      </h2>
      <p className="form-note">Markeras som streckade linjer i viktgrafen.</p>
      <ul className="dose-changes" data-testid="dose-changes">
        {[...changes].reverse().map((c) => (
          <li key={`${c.date}-${c.medicationName}-${String(c.doseMg)}`}>
            <span>{formatDate(c.date)}</span>
            <span>
              {c.kind === 'start' ? 'Start: ' : ''}
              {describeDose(c)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
