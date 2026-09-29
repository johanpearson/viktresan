import { SOURCE_LABELS, type FoodItem } from '../lib/foodSearch.ts';
import { formatGrams, formatKcal } from '../lib/format.ts';
import { fiberForItem, isFiberRich, type FiberSource } from '../lib/fiber.ts';
import { scaleNutrients } from '../lib/nutrition.ts';
import { isProteinRich } from '../lib/protein.ts';
import { quickDetail } from '../lib/quickLog.ts';
import { Macros } from './Macros.tsx';

interface FoodListProps {
  items: readonly FoodItem[];
  onPick: (item: FoodItem) => void;
  /** Visas när listan är tom. */
  empty: string;
  testId?: string;
  /** Visa etiketterna "Proteinrik" (≥ 15 g protein per 100 kcal) och "Fiberrik" (≥ 3 g fiber per 100 kcal). */
  markRich?: boolean;
  /** Fiberdata för raderna, `null` medan den laddas (då visas ingen fiber). */
  fiberSource?: FiberSource | null;
}

function detail(item: FoodItem): string {
  if (item.source === 'snabb') return `${SOURCE_LABELS.snabb} ${quickDetail(item)}`;
  const per100 = `${formatKcal(item.per100.kcal)}/100 ${item.per100Unit ?? 'g'}`;
  const unit = item.units?.[0];
  if (!unit) return `${SOURCE_LABELS[item.source]} · ${per100}`;
  const perUnit = formatKcal((item.per100.kcal * unit.grams) / 100);
  return `${SOURCE_LABELS[item.source]} · ${perUnit} per ${unit.name} (${formatGrams(unit.grams)})`;
}

/** Lista med livsmedel att välja, t.ex. sökträffar eller snabbval. */
export function FoodList({
  items,
  onPick,
  empty,
  testId = 'food-option',
  markRich = false,
  fiberSource = null,
}: FoodListProps) {
  if (items.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="pick-list">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="pick"
            data-testid={testId}
            onClick={() => {
              onPick(item);
            }}
          >
            <span className="pick-name">
              {item.name}
              {markRich && item.source !== 'snabb' && isProteinRich(item.per100) && (
                <span className="tag" data-testid="protein-rich">
                  Proteinrik
                </span>
              )}
              {markRich && item.source !== 'snabb' && isFiberRich(item) && (
                <span className="tag tag-fiber" data-testid="fiber-rich">
                  Fiberrik
                </span>
              )}
            </span>
            <span className="pick-detail">{detail(item)}</span>
            {item.source !== 'snabb' && <PickMacros item={item} fiberSource={fiberSource} />}
          </button>
        </li>
      ))}
    </ul>
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
