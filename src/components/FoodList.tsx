import { useRef, type PointerEvent, type ReactNode } from 'react';
import { SOURCE_LABELS, SOURCE_TAGS, type FoodItem } from '../lib/foodSearch.ts';
import { formatGrams, formatKcal } from '../lib/format.ts';
import { claimsFor } from '../lib/claims.ts';
import { fiberForItem, type FiberSource } from '../lib/fiber.ts';
import { scaleNutrients } from '../lib/nutrition.ts';
import { quickDetail } from '../lib/quickLog.ts';
import { useLongPress } from '../lib/useLongPress.ts';
import { useSwipe } from '../lib/useSwipe.ts';
import { ClaimTags } from './ClaimTags.tsx';
import { Macros } from './Macros.tsx';

interface FoodListProps {
  items: readonly FoodItem[];
  onPick: (item: FoodItem) => void;
  /** Visas när listan är tom. */
  empty: string;
  testId?: string;
  /**
   * Fiberdata för raderna, `null` medan den laddas (då visas ingen fiber). Används även för
   * näringsetiketterna (Proteinrik, Fiberrik, Energisnål – `claims.ts`) på måltider och recept.
   */
  fiberSource?: FiberSource | null;
  /**
   * Radens åtgärd (Dölj, eller Ta bort för egna): svep vänster kör den direkt, långtryck
   * (och kontextmenyn) öppnar `onMenu`. `undefined` = inga åtgärder.
   */
  rowAction?: (item: FoodItem) => { label: string; run: () => void } | undefined;
  onMenu?: (item: FoodItem) => void;
  /** Extra rader efter ett livsmedel (t.ex. "Visa fler varianter"), nyckel = livsmedlets id. */
  after?: ReadonlyMap<string, ReactNode>;
}

/** Energin per enhet (eller 100 g). Källan står före: etikett eller text (måltid, recept). */
function detail(item: FoodItem): string {
  if (item.source === 'snabb') return `${SOURCE_LABELS.snabb} ${quickDetail(item)}`;
  const prefix = SOURCE_TAGS[item.source] === undefined ? `${SOURCE_LABELS[item.source]} · ` : '';
  const per100 = `${formatKcal(item.per100.kcal)}/100 ${item.per100Unit ?? 'g'}`;
  const unit = item.units?.[0];
  if (!unit) return `${prefix}${per100}`;
  const perUnit = formatKcal((item.per100.kcal * unit.grams) / 100);
  return `${prefix}${perUnit} per ${unit.name} (${formatGrams(unit.grams)})`;
}

/** Liten källetikett (LV, Fineli, OFF, Egen); skärmläsare får källans fulla namn. */
function SourceTag({ item }: { item: FoodItem }) {
  const tag = SOURCE_TAGS[item.source];
  if (tag === undefined) return null;
  return (
    <span className="tag tag-source" data-testid="source-tag" data-source={item.source}>
      <span aria-hidden="true">{tag}</span>
      <span className="visually-hidden">Källa: {SOURCE_LABELS[item.source]}.</span>
    </span>
  );
}

/** Lista med livsmedel att välja, t.ex. sökträffar eller snabbval. */
export function FoodList({
  items,
  onPick,
  empty,
  testId = 'food-option',
  fiberSource = null,
  rowAction,
  onMenu,
  after,
}: FoodListProps) {
  if (items.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="pick-list">
      {items.map((item) => (
        <PickRow
          key={item.id}
          item={item}
          testId={testId}
          fiberSource={fiberSource}
          action={rowAction?.(item)}
          onPick={onPick}
          onMenu={onMenu}
          after={after?.get(item.id)}
        />
      ))}
    </ul>
  );
}

/**
 * Ett livsmedel i listan: tryck = välj, svep vänster = radens åtgärd (texten syns bakom raden),
 * långtryck = menyn. Samma svep som `ListRow` (`useSwipe`, `touch-action: pan-y`).
 */
function PickRow({
  item,
  testId,
  fiberSource,
  action,
  onPick,
  onMenu,
  after,
}: {
  item: FoodItem;
  testId: string;
  fiberSource: FiberSource | null;
  action: { label: string; run: () => void } | undefined;
  onPick: (item: FoodItem) => void;
  onMenu: ((item: FoodItem) => void) | undefined;
  after: ReactNode;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const swipe = useSwipe(rowRef, action?.run, undefined);
  const press = useLongPress(
    onMenu
      ? () => {
          onMenu(item);
        }
      : undefined,
  );
  const { offset } = swipe;
  const handlers = action
    ? {
        onPointerDown: (e: PointerEvent) => {
          swipe.handlers.onPointerDown(e);
          press.onPointerDown(e);
        },
        onPointerMove: (e: PointerEvent) => {
          swipe.handlers.onPointerMove(e);
          press.onPointerMove(e);
        },
        onPointerUp: (e: PointerEvent) => {
          swipe.handlers.onPointerUp(e);
          press.onPointerUp();
        },
        onPointerCancel: (e: PointerEvent) => {
          swipe.handlers.onPointerCancel(e);
          press.onPointerCancel();
        },
        onContextMenu: press.onContextMenu,
      }
    : {};
  return (
    <>
      <li
        ref={rowRef}
        className="pick-row"
        data-swiping={offset < 0 ? 'left' : undefined}
        data-testid={`${testId}-row`}
      >
        {action && (
          <span className="list-row-action list-row-action-left" aria-hidden="true">
            {action.label}
          </span>
        )}
        <div
          className="pick-content"
          data-swipeable={action ? 'true' : undefined}
          data-dragging={swipe.dragging ? 'true' : undefined}
          // Förskjutningen sätts via CSSOM (React-style) och omfattas inte av CSP:ns style-src.
          style={offset !== 0 ? { transform: `translateX(${String(offset)}px)` } : undefined}
          {...handlers}
        >
          <button
            type="button"
            className="pick"
            data-testid={testId}
            onClick={() => {
              // Ett svep eller långtryck ska inte också välja livsmedlet.
              if (swipe.consumeSwipe() || press.consumeLongPress()) return;
              onPick(item);
            }}
          >
            <span className="pick-name">
              {item.name}
              <ClaimTags claims={claimsFor(item, fiberSource)} />
            </span>
            <span className="pick-detail">
              <SourceTag item={item} />
              {detail(item)}
            </span>
            {item.source !== 'snabb' && <PickMacros item={item} fiberSource={fiberSource} />}
          </button>
        </div>
      </li>
      {after}
    </>
  );
}

/** Makron och fiber för samma mängd som kcal i raden: livsmedlets första enhet, annars 100 g. */
function PickMacros({ item, fiberSource }: { item: FoodItem; fiberSource: FiberSource | null }) {
  const grams = item.units?.[0]?.grams ?? 100;
  return (
    <span className="pick-detail pick-macros" data-testid="pick-macros">
      <Macros
        nutrients={scaleNutrients(item.per100, grams)}
        fiber={fiberSource ? fiberForItem(item, grams, fiberSource) : undefined}
      />
    </span>
  );
}
