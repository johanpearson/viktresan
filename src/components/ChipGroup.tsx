import { useId, type ReactNode } from 'react';

export interface ChipOption<T extends string> {
  id: T;
  label: string;
  /** Namn för skärmläsare när etiketten är kort, t.ex. "måndag" för "mån". */
  ariaLabel?: string;
  /** Liten dämpad rad under etiketten, t.ex. "Förslag". */
  hint?: ReactNode;
}

interface ChipGroupProps<T extends string> {
  /** Fältetikett ovanför chipsen, även gruppens namn. */
  label: string;
  options: readonly ChipOption<T>[];
  /** Valda alternativ (ett för enkelval, flera för flerval). */
  selected: readonly T[];
  /** Tryck på ett chip: anroparen växlar (flerval) eller väljer (enkelval). */
  onToggle: (id: T) => void;
  /** Lika breda chips i ett rutnät med så många kolumner (veckodagar = 7). Annars radbryts de. */
  columns?: number;
  /** Etiketten bara för skärmläsare (när en kortrubrik redan säger vad valen gäller). */
  hideLabel?: boolean;
  className?: string;
}

/**
 * Val som chips (`aria-pressed`): biverkningar, veckodagar, injektionsställe. Samma utseende som
 * snabbvalen för dryck – vald = ram och text i `--accent`.
 */
export function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
  columns,
  hideLabel = false,
  className,
}: ChipGroupProps<T>) {
  const labelId = useId();
  const classes = ['chip-grid', columns ? 'chip-grid-columns' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="control-field">
      <span className={hideLabel ? 'visually-hidden' : 'field-label'} id={labelId}>
        {label}
      </span>
      {/* React-style sätts via CSSOM och omfattas inte av CSP:ns style-src. */}
      <div
        className={classes}
        role="group"
        aria-labelledby={labelId}
        style={columns ? { gridTemplateColumns: `repeat(${String(columns)}, 1fr)` } : undefined}
      >
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="chip"
            aria-pressed={selected.includes(o.id)}
            aria-label={o.ariaLabel}
            data-value={o.id}
            onClick={() => {
              onToggle(o.id);
            }}
          >
            {o.label}
            {o.hint && <span className="chip-hint">{o.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
