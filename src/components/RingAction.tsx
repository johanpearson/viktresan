import type { ComponentProps } from 'react';
import { GoalRing } from './GoalRing.tsx';

interface RingActionProps extends ComponentProps<typeof GoalRing> {
  /** Bildtexten under ringen, t.ex. "Dryck". Den är också åtgärdens namn. */
  caption: string;
  /** Länk (t.ex. `#/mat/naring`) … */
  href?: string;
  /** … eller tryck som öppnar en panel. */
  onOpen?: () => void;
  /** Uppläst namn om bildtexten inte räcker, t.ex. "Kalorier – visa kalorimålet". */
  actionLabel?: string;
}

/**
 * En ring (`GoalRing`) i Översikt → Idag som går att trycka på: hela figuren är tryckytan, men
 * själva knappen/länken är bildtexten så att ringen behåller sin roll (progressbar) för skärmläsare.
 */
export function RingAction({
  caption,
  href,
  onOpen,
  actionLabel,
  testId,
  ...ring
}: RingActionProps) {
  const label = actionLabel ?? caption;
  return (
    <figure
      className="ring-figure ring-action"
      data-testid={testId ? `${testId}-action` : undefined}
    >
      <GoalRing {...ring} {...(testId ? { testId } : {})} />
      <figcaption>
        {href !== undefined ? (
          <a className="ring-link" href={href} aria-label={label}>
            {caption}
          </a>
        ) : (
          <button
            type="button"
            className="ring-link"
            aria-haspopup="dialog"
            aria-label={label}
            onClick={onOpen}
          >
            {caption}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
