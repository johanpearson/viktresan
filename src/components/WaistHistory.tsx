import type { WaistEntry } from '../db/db.ts';
import { formatCm, formatDate } from '../lib/format.ts';
import { filterRange, type RangeId } from '../lib/stats.ts';

interface WaistHistoryProps {
  waist: readonly WaistEntry[];
  range: RangeId;
  today: string;
}

/** Framsteg → Historik: midjemått i vald period, nyast först. */
export function WaistHistory({ waist, range, today }: WaistHistoryProps) {
  const inRange = filterRange(waist, range, today).reverse();

  return (
    <section className="card" aria-labelledby="waist-history-title">
      <h2 className="card-title" id="waist-history-title">
        Midjemått
      </h2>
      {inRange.length === 0 ? (
        <p className="muted">
          {waist.length === 0 ? 'Inga midjemått ännu.' : 'Inga midjemått i vald period.'}
        </p>
      ) : (
        <table className="table" data-testid="waist-history">
          <thead>
            <tr>
              <th scope="col">Datum</th>
              <th scope="col" className="num">
                Midja
              </th>
            </tr>
          </thead>
          <tbody>
            {inRange.map((w) => (
              <tr key={w.date}>
                <td>{formatDate(w.date)}</td>
                <td className="num">{formatCm(w.waistCm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
