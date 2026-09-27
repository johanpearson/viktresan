import type { WaistEntry } from '../db/db.ts';
import { formatCm, formatDate } from '../lib/format.ts';
import { filterRange, type RangeId } from '../lib/stats.ts';
import { useShowMore } from '../lib/useShowMore.ts';
import { Card } from './Card.tsx';
import { ShowMore } from './ShowMore.tsx';

interface WaistHistoryProps {
  waist: readonly WaistEntry[];
  range: RangeId;
  today: string;
}

/** Framsteg → Historik: midjemått i vald period, nyast först (de senaste + "Visa fler"). */
export function WaistHistory({ waist, range, today }: WaistHistoryProps) {
  const inRange = filterRange(waist, range, today).reverse();
  const { shown, hidden, next, more } = useShowMore(inRange);

  return (
    <Card title="Midjemått">
      {inRange.length === 0 ? (
        <p className="muted">
          {waist.length === 0 ? 'Inga midjemått ännu.' : 'Inga midjemått i vald period.'}
        </p>
      ) : (
        <>
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
              {shown.map((w) => (
                <tr key={w.date}>
                  <td>{formatDate(w.date)}</td>
                  <td className="num">{formatCm(w.waistCm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ShowMore hidden={hidden} onClick={more}>
            Visa {next} mått till
          </ShowMore>
        </>
      )}
    </Card>
  );
}
