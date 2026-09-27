import { BottomSheet } from './BottomSheet.tsx';
import { ListRow } from './ListRow.tsx';

export interface SheetAction {
  label: string;
  onSelect: () => void;
  /** Destruktivt val (Ta bort): fel-färg, läggs sist. */
  danger?: boolean;
}

interface ActionSheetProps {
  title: string;
  /** Kort beskrivning av det valda, t.ex. "Buk vänster · 16 sep 08:05". */
  description?: string;
  actions: readonly SheetAction[];
  onClose: () => void;
}

/**
 * Radmeny: en liten panel med ett val per rad (`ListRow`). Används när en rad i en lista
 * trycks och det inte finns något formulär att redigera i – t.ex. en loggad dos eller ett
 * schema. Destruktiva val stänger menyn och följs av en `Toast` med Ångra.
 */
export function ActionSheet({ title, description, actions, onClose }: ActionSheetProps) {
  return (
    <BottomSheet title={title} onClose={onClose}>
      {description && <p className="action-sheet-description">{description}</p>}
      <ul className="list action-list">
        {actions.map((a) => (
          <ListRow
            key={a.label}
            primary={a.label}
            danger={a.danger ?? false}
            chevron={!a.danger}
            onClick={() => {
              onClose();
              a.onSelect();
            }}
          />
        ))}
      </ul>
    </BottomSheet>
  );
}
