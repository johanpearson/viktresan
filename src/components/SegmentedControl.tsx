interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  /** Gruppens namn för skärmläsare, t.ex. "Visa". */
  label: string;
  options: readonly SegmentedOption<T>[];
  /** Valt alternativ; `null` = inget valt (t.ex. en bild utan vinkel). */
  value: T | null;
  onChange: (value: T) => void;
  /** `small` (44 px, i sidhuvudet) eller `regular` (48 px, i innehållet). */
  size?: 'small' | 'regular';
  className?: string;
}

/** Segmentkontroll: knappar med aria-pressed, en vald i taget. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'regular',
  className,
}: SegmentedControlProps<T>) {
  const classes = ['segmented', size === 'small' ? 'segmented-small' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="segmented-button"
          aria-pressed={o.id === value}
          onClick={() => {
            onChange(o.id);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
