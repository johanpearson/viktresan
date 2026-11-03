import { formatDate, formatKg } from '../lib/format.ts';
import type { DailyWeight } from '../lib/stats.ts';
import { useShowMore } from '../lib/useShowMore.ts';
import { Card } from './Card.tsx';
import { ShowMore } from './ShowMore.tsx';

interface WeightDaysProps {
  /** Dagsvikter i vald period, äldst först. */
  daily: readonly DailyWeight[];
}

/** Framsteg → Historik: vikten dag för dag, nyast först (de senaste + "Visa fler"). */
export function WeightDays({ daily }: WeightDaysProps) {
  const { shown, hidden, next, more } = useShowMore([...daily].reverse());
  return (
    <Card title="Vikt dag för dag">
      <table className="table" data-testid="history-table">
        <thead>
          <tr>
            <th scope="col">Datum</th>
            <th scope="col" className="num">
              Vikt
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((d) => (
            <tr key={d.date}>
              <td>{formatDate(d.date)}</td>
              <td className="num">
                {formatKg(d.weightKg)}
                {d.count > 1 && (
                  <span className="muted-inline" title="Medel av flera mätningar">
                    {' '}
                    (×{d.count})
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ShowMore hidden={hidden} onClick={more}>
        Visa {next} dagar till
      </ShowMore>
    </Card>
  );
}
