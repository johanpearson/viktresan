interface ProgressBarProps {
  /** 0–1. */
  fraction: number;
  label: string;
  /** Uppläst värde, t.ex. "1 250 av 1 800 kcal". Standard: procent. */
  valueText?: string;
  /** Färg/storlek, t.ex. `progress-kcal progress-thin`. */
  className?: string;
}

export function ProgressBar({ fraction, label, valueText, className }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div
      className={className ? `progress ${className}` : 'progress'}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText ?? `${percent} %`}
    >
      {/* React-style sätts via CSSOM och omfattas inte av CSP:ns style-src. */}
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
