import { useState } from 'react';
import type { PhotoItem } from '../lib/usePhotos.ts';

export type CompareMode = 'side' | 'slider';

interface PhotoCompareProps {
  before: PhotoItem;
  after: PhotoItem;
  /** Bildtexter, t.ex. "25 aug. 2026 · 90,5 kg". */
  beforeLabel: string;
  afterLabel: string;
  mode: CompareMode;
  /** Skiljer reglagen åt när flera jämförelser visas (t.ex. "framifrån"). */
  name?: string;
}

/** Jämför två bilder: sida vid sida eller överlagrade med ett dra-reglage. */
export function PhotoCompare({
  before,
  after,
  beforeLabel,
  afterLabel,
  mode,
  name,
}: PhotoCompareProps) {
  const [position, setPosition] = useState(50);
  const suffix = name ? ` ${name}` : '';

  if (mode === 'side') {
    return (
      <div className="compare-side">
        <figure className="compare-figure">
          <img src={before.url} alt={`Före${suffix}: ${beforeLabel}`} />
          <figcaption>
            <strong>Före</strong> {beforeLabel}
          </figcaption>
        </figure>
        <figure className="compare-figure">
          <img src={after.url} alt={`Efter${suffix}: ${afterLabel}`} />
          <figcaption>
            <strong>Efter</strong> {afterLabel}
          </figcaption>
        </figure>
      </div>
    );
  }

  return (
    <>
      {/* React-style sätts via CSSOM och omfattas inte av CSP:ns style-src. */}
      <div
        className="compare-slider"
        style={{ aspectRatio: `${after.width ?? 3} / ${after.height ?? 4}` }}
      >
        <img src={after.url} alt={`Efter${suffix}: ${afterLabel}`} />
        <img
          className="compare-before"
          src={before.url}
          alt={`Före${suffix}: ${beforeLabel}`}
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        />
        <span className="compare-divider" style={{ left: `${position}%` }} aria-hidden="true" />
        <span className="compare-tag compare-tag-before" aria-hidden="true">
          Före
        </span>
        <span className="compare-tag compare-tag-after" aria-hidden="true">
          Efter
        </span>
        <input
          className="compare-range"
          type="range"
          min={0}
          max={100}
          value={position}
          aria-label={`Före/efter-reglage${suffix}`}
          aria-valuetext={`${position} % före`}
          onChange={(e) => {
            setPosition(Number(e.target.value));
          }}
        />
      </div>
      <p className="compare-caption">
        <span>Före: {beforeLabel}</span>
        <span>Efter: {afterLabel}</span>
      </p>
    </>
  );
}
