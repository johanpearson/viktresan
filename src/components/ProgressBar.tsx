import { toneClass, type Tone } from '../lib/tones.ts';

/** En del av en uppdelad stapel (t.ex. mat + tillskott), andel 0–1 av hela stapeln. */
export interface BarSegment {
  fraction: number;
  tone: Tone;
}

interface ProgressBarProps {
  /** 0–1. */
  fraction: number;
  /** Uppdelad stapel: delarna ritas efter varandra i sina färger (summan kapas vid 1). */
  segments?: readonly BarSegment[] | undefined;
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
  segments,
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
      {segments ? (
        segmentWidths(segments).map((s, i) => (
          <div
            key={i}
            className={`progress-fill progress-segment ${toneClass(s.tone)}`}
            style={{ width: `${String(s.percent)}%` }}
          />
        ))
      ) : (
        <div className="progress-fill" style={{ width: `${String(percent)}%` }} />
      )}
    </div>
  );
}

/** Delarnas bredd i procent, kapade så att hela stapeln aldrig blir längre än 100 %. */
function segmentWidths(segments: readonly BarSegment[]): { tone: Tone; percent: number }[] {
  let used = 0;
  return segments.map((s) => {
    const percent = Math.max(0, Math.min(100 - used, s.fraction * 100));
    used += percent;
    return { tone: s.tone, percent };
  });
}
