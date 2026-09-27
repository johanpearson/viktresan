import { toneClass, type Tone } from '../lib/tones.ts';

interface ProgressBarProps {
  /** 0–1. */
  fraction: number;
  label: string;
  /** Uppläst värde, t.ex. "1 250 av 1 800 kcal". Standard: procent. */
  valueText?: string;
  /** Datatypens färg (standard: accent). */
  tone?: Tone;
  /** Tunn stapel (8 px) i täta vyer. */
  thin?: boolean;
  /** Extra klasser. */
  className?: string;
  /** Bara visuell (kopia av en stapel som redan finns för skärmläsare). */
  decorative?: boolean;
}

export function ProgressBar({
  fraction,
  label,
  valueText,
  tone,
  thin = false,
  className,
  decorative = false,
}: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  const classes = ['progress', thin ? 'progress-thin' : '', toneClass(tone), className ?? '']
    .filter(Boolean)
    .join(' ');
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : {
        role: 'progressbar',
        'aria-label': label,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': percent,
        'aria-valuetext': valueText ?? `${String(percent)} %`,
      };
  return (
    <div className={classes} {...a11y}>
      {/* React-style sätts via CSSOM och omfattas inte av CSP:ns style-src. */}
      <div className="progress-fill" style={{ width: `${String(percent)}%` }} />
    </div>
  );
}
