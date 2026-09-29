import { useRef, type ReactNode } from 'react';
import { useRingFit } from '../lib/useRingFit.ts';

interface RingRowProps {
  /** Fyra ringar: lika breda kolumner som krymper med skärmen (`.rings-4`). */
  four?: boolean;
  children: ReactNode;
}

/**
 * En rad ringar (`GoalRing`/`RingAction`). Texten i alla ringar får samma storlek, styrd av den
 * längsta, och krymps så att den ryms inom ringens inre cirkel – aldrig under `--ring-text-min`.
 */
export function RingRow({ four = false, children }: RingRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  useRingFit(ref);
  return (
    <div ref={ref} className={four ? 'rings rings-4' : 'rings'} data-testid="ring-row">
      {children}
    </div>
  );
}
