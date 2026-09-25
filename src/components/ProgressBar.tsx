interface ProgressBarProps {
  /** 0–1. */
  fraction: number;
  label: string;
}

export function ProgressBar({ fraction, label }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent} %`}
    >
      {/* React-style sätts via CSSOM och omfattas inte av CSP:ns style-src. */}
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
