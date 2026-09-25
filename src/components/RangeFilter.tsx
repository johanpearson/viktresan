import type { RangeId } from '../lib/stats.ts';

const OPTIONS: readonly { id: RangeId; label: string }[] = [
  { id: '1m', label: '1 mån' },
  { id: '3m', label: '3 mån' },
  { id: 'all', label: 'Allt' },
];

interface RangeFilterProps {
  value: RangeId;
  onChange: (range: RangeId) => void;
}

/** Tidsfilter: en rad med växlingsknappar. */
export function RangeFilter({ value, onChange }: RangeFilterProps) {
  return (
    <div className="segmented" role="group" aria-label="Tidsperiod">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className="segmented-button"
          aria-pressed={option.id === value}
          onClick={() => {
            onChange(option.id);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
