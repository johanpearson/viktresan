import { MEAL_KIND_LABELS, type MealId, type MealSlot } from '../lib/mealSlots.ts';
import { loggedEntriesText, mealSlotRemovalText } from '../lib/removal.ts';
import { DetailSheet } from './DetailSheet.tsx';
import { ListRow } from './ListRow.tsx';

interface MealSlotDetailProps {
  sheet: { slot: MealSlot; count: number };
  /** Förvalet att flytta posterna till. */
  target: MealSlot | null;
  /** Den sista måltiden kan inte tas bort. */
  removable: boolean;
  onEdit: () => void;
  onRemove: (targetId: MealId) => void;
  onChooseTarget: () => void;
  onClose: () => void;
}

/** Detaljvyn för en måltid: tid, typ och antal poster; Ta bort förklarar flytten av posterna. */
export function MealSlotDetail({
  sheet,
  target,
  removable,
  onEdit,
  onRemove,
  onChooseTarget,
  onClose,
}: MealSlotDetailProps) {
  const { slot, count } = sheet;
  return (
    <DetailSheet
      title={slot.name}
      testId="meal-slot-detail"
      onClose={onClose}
      onEdit={onEdit}
      remove={
        removable && target
          ? {
              label: 'Ta bort måltiden',
              title: `Ta bort ${slot.name}?`,
              consequence: mealSlotRemovalText(count, target.name),
              confirmLabel: count > 0 ? `Ta bort och flytta till ${target.name}` : 'Ta bort',
              onConfirm: () => {
                onRemove(target.id);
              },
              alternatives:
                count > 0 ? [{ label: 'Välj en annan måltid', onSelect: onChooseTarget }] : [],
            }
          : undefined
      }
    >
      <ListRow primary="Ungefärlig tid" value={<span className="num">{slot.time}</span>} />
      <ListRow primary="Typ" value={MEAL_KIND_LABELS[slot.kind]} />
      <ListRow
        primary="I matloggen"
        value={count === 0 ? 'Inga poster' : loggedEntriesText(count)}
      />
    </DetailSheet>
  );
}
