import { useId } from 'react';

interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  /** Namn för skärmläsare när etiketten är kort, t.ex. "Aptit 2" för "2". */
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  /** Gruppens namn för skärmläsare, t.ex. "Visa". */
  label: string;
  /** Visa `label` som fältetikett ovanför (i formulär, t.ex. "Status"). */
  showLabel?: boolean;
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
  showLabel = false,
  options,
  value,
  onChange,
  size = 'regular',
  className,
}: SegmentedControlProps<T>) {
  const labelId = useId();
  const classes = ['segmented', size === 'small' ? 'segmented-small' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const buttons = options.map((o) => (
    <button
      key={o.id}
      type="button"
      className="segmented-button"
      aria-pressed={o.id === value}
      aria-label={o.ariaLabel}
      onClick={() => {
        onChange(o.id);
      }}
    >
      {o.label}
    </button>
  ));
  if (!showLabel) {
    return (
      <div className={classes} role="group" aria-label={label}>
        {buttons}
      </div>
    );
  }
  return (
    <div className="control-field">
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <div className={classes} role="group" aria-labelledby={labelId}>
        {buttons}
      </div>
    </div>
  );
}
