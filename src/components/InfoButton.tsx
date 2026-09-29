interface InfoButtonProps {
  /** Knappens namn för skärmläsare, t.ex. "Vad är trendvikt?". */
  label: string;
  expanded: boolean;
  /** Id för förklaringen som knappen fäller ut. */
  controls: string;
  onToggle: () => void;
  testId?: string;
}

/**
 * Liten info-ikon (16 px, tryckyta 44 px) som fäller ut en förklaring: dämpad, i `--accent`
 * när förklaringen är utfälld.
 */
export function InfoButton({ label, expanded, controls, onToggle, testId }: InfoButtonProps) {
  return (
    <button
      type="button"
      className="info-button"
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      data-testid={testId}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
      </svg>
    </button>
  );
}
