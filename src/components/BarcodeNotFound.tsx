import { offContributeUrl } from '../lib/barcode.ts';
import { Card } from './Card.tsx';
import { ListRow } from './ListRow.tsx';

interface BarcodeNotFoundProps {
  ean: string;
  /** Vad som läggs in: styr texterna. */
  kind: 'livsmedel' | 'tillskott';
  onAi: () => void;
  onManual: () => void;
}

/**
 * Ingen träff på en streckkod – varken lokalt eller i Open Food Facts. Två vägar vidare
 * (valrader, inte en stapel knappar) med streckkoden förifylld, och en diskret länk för
 * att lägga till produkten i Open Food Facts.
 */
export function BarcodeNotFound({ ean, kind, onAi, onManual }: BarcodeNotFoundProps) {
  return (
    <Card
      title={
        <>
          Hittade inte <span className="num">{ean}</span>
        </>
      }
      testId="ean-not-found"
    >
      <p className="form-note muted">
        Streckkoden finns varken bland det du sparat eller i Open Food Facts. Lägg in{' '}
        {kind === 'tillskott' ? 'tillskottet' : 'livsmedlet'} själv – streckkoden sparas så att
        nästa skanning hittar det direkt.
      </p>
      <ul className="list">
        <ListRow
          primary="Lägg in med AI från etikett"
          secondary="Fota näringsdeklarationen i en AI-tjänst och klistra in svaret"
          chevron
          onClick={onAi}
        />
        <ListRow
          primary="Lägg in manuellt"
          secondary="Skriv av värdena"
          chevron
          onClick={onManual}
        />
      </ul>
      <a
        className="subtle-link"
        href={offContributeUrl(ean)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Bidra till Open Food Facts
      </a>
    </Card>
  );
}
