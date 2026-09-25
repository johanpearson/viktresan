import { SOURCE_LABELS, type FoodItem } from '../lib/foodSearch.ts';
import { formatGrams, formatKcal } from '../lib/format.ts';

interface FoodListProps {
  items: readonly FoodItem[];
  onPick: (item: FoodItem) => void;
  /** Visas när listan är tom. */
  empty: string;
  testId?: string;
}

function detail(item: FoodItem): string {
  const per100 = `${formatKcal(item.per100.kcal)}/100 g`;
  if (item.portionG == null) return `${SOURCE_LABELS[item.source]} · ${per100}`;
  const portion = formatKcal((item.per100.kcal * item.portionG) / 100);
  return `${SOURCE_LABELS[item.source]} · ${portion} per ${item.portionName ?? 'portion'} (${formatGrams(item.portionG)})`;
}

/** Lista med livsmedel att välja, t.ex. sökträffar eller snabbval. */
export function FoodList({ items, onPick, empty, testId = 'food-option' }: FoodListProps) {
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
            <span className="pick-name">{item.name}</span>
            <span className="pick-detail">{detail(item)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
