interface FiberMissingNoteProps {
  id: string;
  /** Antal poster utan fiberdata. */
  missing: number;
}

/**
 * Förklaringen bakom info-ikonen vid fibervärdet (Mat → Dag, Mat → Näring): varför dagens
 * fiber kan vara i underkant. Värdet har en asterisk (*) när en del av posterna har fiber.
 */
export function FiberMissingNote({ id, missing }: FiberMissingNoteProps) {
  return (
    <p className="form-note muted fiber-info" id={id} data-testid="fiber-incomplete">
      * Dagens fiber kan vara i underkant –{' '}
      {missing === 1 ? '1 post saknar' : `${String(missing)} poster saknar`} fiberdata. Snabbloggar
      och livsmedel utan fibervärde räknas inte in.
    </p>
  );
}
