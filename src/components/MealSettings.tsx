import { useCallback, useEffect, useState } from 'react';
import {
  countFoodLogByMeal,
  deleteMealSlot,
  listMealSlots,
  newId,
  putFoodLogEntries,
  putMealSlots,
} from '../db/db.ts';
import { MEAL_KIND_LABELS, applyMealOrder, type MealId, type MealSlot } from '../lib/mealSlots.ts';
import { useDragReorder } from '../lib/useDragReorder.ts';
import { useUndoToast } from '../lib/useUndoToast.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { ListRow } from './ListRow.tsx';
import { MealSlotForm, type MealSlotValues } from './MealSlotForm.tsx';
import { MealSlotRemove } from './MealSlotRemove.tsx';
import { Toast } from './Toast.tsx';

/** Panelen ovanpå listan: ny måltid, redigera eller ta bort (med flytt av posterna). */
type Sheet =
  | { kind: 'new' }
  | { kind: 'edit'; slot: MealSlot }
  | { kind: 'remove'; slot: MealSlot; count: number };

/** Sex prickar – handtaget som raden dras i. */
function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      {[6, 12, 18].map((y) => (
        <g key={y}>
          <circle cx="9" cy={y} r="1.6" fill="currentColor" />
          <circle cx="15" cy={y} r="1.6" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

/**
 * Inställningar → Måltider: dagens måltider med namn, ungefärlig tid och typ. Tryck = redigera,
 * dra i handtaget (eller piltangenter) = ändra ordning, svep vänster = ta bort. Har måltiden poster
 * frågar appen vilken måltid de ska flyttas till.
 */
export function MealSettings() {
  const [slots, setSlots] = useState<MealSlot[] | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const toast = useUndoToast();

  const reload = useCallback(async () => {
    const next = await listMealSlots();
    setSlots(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    void listMealSlots().then((next) => {
      if (active) setSlots(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const list = slots ?? [];
  const ids = list.map((s) => s.id);
  const reorder = useDragReorder(ids, (next, movedId) => {
    const now = Date.now();
    const reordered = applyMealOrder(list, next, now);
    setSlots(reordered);
    const at = reordered.findIndex((s) => s.id === movedId);
    const moved = reordered[at];
    if (moved) {
      setAnnouncement(`${moved.name}: plats ${String(at + 1)} av ${String(reordered.length)}.`);
    }
    void putMealSlots(reordered.filter((s) => s.updatedAt === now)).then(reload);
  });
  const byId = new Map(list.map((s) => [s.id, s]));
  const shown = reorder.order.map((id) => byId.get(id)).filter((s) => s !== undefined);

  async function save(values: MealSlotValues, slot: MealSlot | null) {
    const now = Date.now();
    const next: MealSlot = slot
      ? { ...slot, ...values, updatedAt: now }
      : { id: newId(), ...values, order: list.length, createdAt: now };
    await putMealSlots([next]);
    setSheet(null);
    await reload();
    toast.show(slot ? `Sparade ${next.name}.` : `La till ${next.name}.`);
  }

  async function startRemove(slot: MealSlot) {
    if (list.length <= 1) return;
    const count = (await countFoodLogByMeal()).get(slot.id) ?? 0;
    if (count > 0) {
      setSheet({ kind: 'remove', slot, count });
      return;
    }
    const target = list.find((s) => s.id !== slot.id);
    if (!target) return;
    setSheet(null);
    await remove(slot, target.id);
  }

  async function remove(slot: MealSlot, targetId: MealId) {
    const originals = await deleteMealSlot(slot.id, targetId);
    setSheet(null);
    await reload();
    const target = list.find((s) => s.id === targetId);
    toast.show(
      originals.length > 0 && target
        ? `Tog bort ${slot.name}. Posterna flyttades till ${target.name}.`
        : `Tog bort ${slot.name}.`,
      async () => {
        await putMealSlots([slot]);
        await putFoodLogEntries(originals);
        await reload();
      },
    );
  }

  const others = (slot: MealSlot | null) => list.filter((s) => s.id !== slot?.id);

  return (
    <>
      <p className="form-note muted">
        Måltiderna i Mat, i den här ordningen. Den måltid vars tid ligger närmast före klockslaget
        är förvald när du loggar.
      </p>
      {slots === null ? (
        <p className="muted">Laddar …</p>
      ) : (
        <ul className="list list-flush reorder-list" aria-label="Måltider" data-testid="meal-slots">
          {shown.map((slot) => {
            const handle = reorder.handleProps(slot.id);
            return (
              <ListRow
                key={slot.id}
                testId={`meal-slot-${slot.id}`}
                className="reorder-row"
                primary={slot.name}
                secondary={`${slot.time} · ${MEAL_KIND_LABELS[slot.kind]}`}
                dragOffset={reorder.dragging?.id === slot.id ? reorder.dragging.offset : undefined}
                onClick={() => {
                  setSheet({ kind: 'edit', slot });
                }}
                swipeLeft={
                  list.length > 1
                    ? {
                        label: 'Ta bort',
                        onSwipe: () => void startRemove(slot),
                      }
                    : undefined
                }
                trailing={
                  <button
                    type="button"
                    className="drag-handle"
                    aria-label={`Ändra ordning: ${slot.name}`}
                    aria-describedby="meal-order-hint"
                    data-testid="drag-handle"
                    {...handle}
                  >
                    <GripIcon />
                  </button>
                }
              />
            );
          })}
        </ul>
      )}
      <p id="meal-order-hint" className="visually-hidden">
        Dra i handtaget eller använd pil upp och pil ner för att flytta måltiden.
      </p>
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
      <button
        type="button"
        className="button button-secondary reorder-add"
        onClick={() => {
          setSheet({ kind: 'new' });
        }}
      >
        Lägg till måltid
      </button>
      {sheet && (
        <BottomSheet
          title={
            sheet.kind === 'new'
              ? 'Ny måltid'
              : sheet.kind === 'edit'
                ? sheet.slot.name
                : `Ta bort ${sheet.slot.name}`
          }
          onClose={() => {
            setSheet(null);
          }}
        >
          {sheet.kind === 'remove' ? (
            <MealSlotRemove
              slot={sheet.slot}
              others={others(sheet.slot)}
              count={sheet.count}
              onRemove={(targetId) => void remove(sheet.slot, targetId)}
              onCancel={() => {
                setSheet({ kind: 'edit', slot: sheet.slot });
              }}
            />
          ) : (
            <MealSlotForm
              key={sheet.kind === 'edit' ? sheet.slot.id : 'new'}
              slot={sheet.kind === 'edit' ? sheet.slot : null}
              others={others(sheet.kind === 'edit' ? sheet.slot : null)}
              onSave={(values) => void save(values, sheet.kind === 'edit' ? sheet.slot : null)}
              onRemove={
                sheet.kind === 'edit' && list.length > 1
                  ? () => void startRemove(sheet.slot)
                  : undefined
              }
            />
          )}
        </BottomSheet>
      )}
      {toast.toast && (
        <Toast
          label="Måltider"
          testId="meal-settings-toast"
          message={toast.toast.message}
          onUndo={toast.onUndo}
          onClose={toast.close}
        />
      )}
    </>
  );
}
