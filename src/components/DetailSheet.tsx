import { useState, type ReactNode } from 'react';
import { ActionSheet, type SheetAction } from './ActionSheet.tsx';
import { BottomSheet } from './BottomSheet.tsx';

/** "Ta bort …" i detaljvyn: bekräftelsen säger vad som händer innan något tas bort. */
export interface DetailRemove {
  /** Knappens text, t.ex. "Ta bort receptet". */
  label: string;
  /** Bekräftelsens rubrik, t.ex. "Ta bort Kycklinggryta?". */
  title: string;
  /** Kort om vad som händer – och vad som finns kvar (loggar, historik). */
  consequence: string;
  /** Bekräftelsens knapp (standard "Ta bort"). */
  confirmLabel?: string;
  onConfirm: () => void;
  /** Fler val i bekräftelsen före Ta bort, t.ex. "Välj en annan måltid". */
  alternatives?: readonly SheetAction[];
}

interface DetailSheetProps {
  title: string;
  onClose: () => void;
  /** Värdena som `ListRow` (etikett till vänster, värde till höger). */
  children: ReactNode;
  /** Redigera öppnar formuläret. */
  onEdit?: (() => void) | undefined;
  /** En viktigare handling än Redigera (t.ex. "Logga 1 portion"): Redigera blir då sekundär. */
  primary?: { label: string; onClick: () => void } | undefined;
  /** Mindre val ovanför Ta bort, t.ex. "Duplicera recept" (ghost-textknappar). */
  extra?: ReactNode;
  remove?: DetailRemove | undefined;
  /** Innehåll efter panelens text, t.ex. en Toast eller en nästlad panel. */
  after?: ReactNode;
  testId?: string;
}

/**
 * Detaljvyn för något användaren skapat (recept, tillskott, fototillfälle …): värdena som
 * rader, Redigera (primär, eller sekundär bredvid en viktigare handling) och "Ta bort …" sist
 * som destruktiv textknapp. Ta bort frågar först (`ActionSheet` ovanpå) och förklarar vad som
 * händer – tidigare loggar och historik påverkas aldrig. Svep i listan tar bort direkt med Ångra.
 */
export function DetailSheet({
  title,
  onClose,
  children,
  onEdit,
  primary,
  extra,
  remove,
  after,
  testId,
}: DetailSheetProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="detail" data-testid={testId}>
        <ul className="list list-flush detail-list">{children}</ul>
        {(primary ?? onEdit) && (
          <div className="button-row">
            {primary && (
              <button type="button" className="button" onClick={primary.onClick}>
                {primary.label}
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                className={primary ? 'button button-secondary' : 'button'}
                onClick={onEdit}
              >
                Redigera
              </button>
            )}
          </div>
        )}
        {extra}
        {remove && (
          <button
            type="button"
            className="button button-ghost button-small button-danger-text"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {remove.label}
          </button>
        )}
      </div>
      {remove && confirming && (
        <ActionSheet
          title={remove.title}
          description={remove.consequence}
          actions={[
            ...(remove.alternatives ?? []),
            { label: remove.confirmLabel ?? 'Ta bort', danger: true, onSelect: remove.onConfirm },
          ]}
          onClose={() => {
            setConfirming(false);
          }}
        />
      )}
      {after}
    </BottomSheet>
  );
}
