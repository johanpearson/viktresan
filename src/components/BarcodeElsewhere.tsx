import type { ScanContext } from '../lib/barcodeLookup.ts';
import { Card } from './Card.tsx';
import { ListRow } from './ListRow.tsx';

interface BarcodeElsewhereProps {
  ean: string;
  /** Var produkten finns sparad. */
  target: ScanContext;
  name: string;
  /** Adressen som öppnar rätt ställe med streckkoden. */
  href: string;
}

/** En streckkod som finns sparad på ett annat ställe – föreslå att öppna det i stället. */
export function BarcodeElsewhere({ ean, target, name, href }: BarcodeElsewhereProps) {
  const where = target === 'tillskott' ? 'ett tillskott' : 'ett livsmedel';
  return (
    <Card title={name} testId="ean-elsewhere">
      <p className="form-note muted">
        <span className="num">{ean}</span> är sparad som {where}.
      </p>
      <ul className="list">
        <ListRow
          primary={target === 'tillskott' ? 'Öppna under Tillskott' : 'Logga under Mat'}
          chevron
          href={href}
        />
      </ul>
    </Card>
  );
}
