interface SkeletonProps {
  /** Antal textrader i kortet. */
  lines?: number;
  /** Stor rad överst (t.ex. huvudsiffran). */
  hero?: boolean;
  /** Antal kort. */
  cards?: number;
}

/**
 * Platshållare medan data läses från IndexedDB, så att vyn inte hoppar när den
 * fylls. Skimrar långsamt (av vid prefers-reduced-motion). En uppläst "Laddar …".
 */
export function Skeleton({ lines = 3, hero = false, cards = 1 }: SkeletonProps) {
  return (
    <div className="skeleton" aria-busy="true" data-testid="skeleton">
      <span className="visually-hidden" role="status">
        Laddar …
      </span>
      {Array.from({ length: cards }, (_, c) => (
        <div className="card skeleton-card" aria-hidden="true" key={c}>
          {hero && c === 0 && <span className="skeleton-line skeleton-hero" />}
          {Array.from({ length: lines }, (_, i) => (
            <span className="skeleton-line" key={i} />
          ))}
        </div>
      ))}
    </div>
  );
}
