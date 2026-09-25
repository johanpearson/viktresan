import { useState } from 'react';
import { daysBetween } from '../lib/dates.ts';
import { formatInt, formatKg, formatPhotoLabel } from '../lib/format.ts';
import type { PhotoItem } from '../lib/usePhotos.ts';

type CompareMode = 'side' | 'slider';

const MODES: readonly { id: CompareMode; label: string }[] = [
  { id: 'side', label: 'Sida vid sida' },
  { id: 'slider', label: 'Reglage' },
];

interface PhotoCompareProps {
  before: PhotoItem;
  after: PhotoItem;
  onClose: () => void;
}

/** Jämför två bilder: sida vid sida eller överlagrade med ett dra-reglage. */
export function PhotoCompare({ before, after, onClose }: PhotoCompareProps) {
  const [mode, setMode] = useState<CompareMode>('side');
  const [position, setPosition] = useState(50);
  const days = daysBetween(before.date, after.date);
  const change =
    before.weightKg != null && after.weightKg != null ? after.weightKg - before.weightKg : null;

  return (
    <section className="card" aria-labelledby="compare-title" data-testid="photo-compare">
      <h2 className="card-title" id="compare-title">
        Jämförelse
      </h2>
      <p className="compare-summary">
        {formatInt(days)} {days === 1 ? 'dag' : 'dagar'} mellan bilderna
        {change != null && <> · {formatKg(change, { signed: true })}</>}
      </p>
      <div className="segmented segmented-2" role="group" aria-label="Jämförelsevy">
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            className="segmented-button"
            aria-pressed={option.id === mode}
            onClick={() => {
              setMode(option.id);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === 'side' ? (
        <div className="compare-side">
          <figure className="compare-figure">
            <img src={before.url} alt={`Före: ${formatPhotoLabel(before)}`} />
            <figcaption>
              <strong>Före</strong> {formatPhotoLabel(before)}
            </figcaption>
          </figure>
          <figure className="compare-figure">
            <img src={after.url} alt={`Efter: ${formatPhotoLabel(after)}`} />
            <figcaption>
              <strong>Efter</strong> {formatPhotoLabel(after)}
            </figcaption>
          </figure>
        </div>
      ) : (
        <>
          {/* React-style sätts via CSSOM och omfattas inte av CSP:ns style-src. */}
          <div
            className="compare-slider"
            style={{ aspectRatio: `${after.width ?? 3} / ${after.height ?? 4}` }}
          >
            <img src={after.url} alt={`Efter: ${formatPhotoLabel(after)}`} />
            <img
              className="compare-before"
              src={before.url}
              alt={`Före: ${formatPhotoLabel(before)}`}
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
              aria-label="Före/efter-reglage"
              aria-valuetext={`${position} % före`}
              onChange={(e) => {
                setPosition(Number(e.target.value));
              }}
            />
          </div>
          <p className="compare-caption">
            <span>Före: {formatPhotoLabel(before)}</span>
            <span>Efter: {formatPhotoLabel(after)}</span>
          </p>
        </>
      )}

      <button type="button" className="button button-secondary compare-close" onClick={onClose}>
        Avsluta jämförelse
      </button>
    </section>
  );
}
