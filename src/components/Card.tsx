import { createContext, useContext, useId, type ReactNode } from 'react';

/** Datatyp eller semantisk ton: färgar kortets vänsterkant (t.ex. dosdag = warning). */
export type CardTone = 'warning' | 'danger' | 'success' | 'info';

interface CardProps {
  /** Rubrik (h2). Utan rubrik behövs `label` för skärmläsare om kortet är en region. */
  title?: ReactNode;
  /** Tillgängligt namn när kortet saknar synlig rubrik. */
  label?: string;
  /** Knapp/länk till höger om rubriken (en sekundär åtgärd, t.ex. Stäng). */
  action?: ReactNode;
  tone?: CardTone;
  className?: string;
  testId?: string;
  children?: ReactNode;
}

/** Sant inne i ett kort – ett kort i ett kort ritas då som en vanlig grupp. */
const InCard = createContext(false);

/**
 * Kort: yta med ram, 16 px inre marginal och valfri rubrikrad. Kort-i-kort är inte
 * tillåtet – ett nästlat `Card` blir en grupp utan egen ram (`card-group`).
 */
export function Card({ title, label, action, tone, className, testId, children }: CardProps) {
  const nested = useContext(InCard);
  const titleId = useId();
  const classes = [nested ? 'card-group' : 'card', tone ? `card-${tone}` : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const heading =
    title != null ? (
      <h2 className="card-title" id={titleId}>
        {title}
      </h2>
    ) : null;
  return (
    <section
      className={classes}
      aria-labelledby={title != null ? titleId : undefined}
      aria-label={title == null ? label : undefined}
      data-testid={testId}
    >
      {action ? (
        <div className="card-header">
          {heading}
          {action}
        </div>
      ) : (
        heading
      )}
      <InCard.Provider value={true}>{children}</InCard.Provider>
    </section>
  );
}
