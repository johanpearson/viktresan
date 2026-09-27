import type { ReactNode } from 'react';

interface EmptyStateAction {
  label: string;
  /** Länk (t.ex. `#/installningar`) … */
  href?: string;
  /** … eller knapp. */
  onClick?: () => void;
}

interface EmptyStateProps {
  /** Kort rubrik, t.ex. "Inga bilder ännu". */
  title?: string;
  /** Förklaring: vad som hamnar här. */
  children: ReactNode;
  /** Den tydliga nästa handlingen (primärknapp). */
  action?: EmptyStateAction;
}

/** Tomt läge: vad som saknas, varför det är värt att fylla i och en knapp för nästa steg. */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {title && <p className="empty-state-title">{title}</p>}
      <p className="empty-state-text">{children}</p>
      {action &&
        (action.href !== undefined ? (
          <a className="button empty-state-action" href={action.href}>
            {action.label}
          </a>
        ) : (
          <button type="button" className="button empty-state-action" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
