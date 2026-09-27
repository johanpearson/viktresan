import type { ReactNode } from 'react';

interface DisclosureProps {
  /** Texten på knappen, t.ex. "Förklaring". */
  summary: string;
  children: ReactNode;
  testId?: string;
}

/**
 * Hopfälld hjälptext (`<details>`): en liten dämpad textknapp med chevron. För sådant man
 * behöver en gång men som inte ska ta plats varje gång (kalenderns förklaring).
 */
export function Disclosure({ summary, children, testId }: DisclosureProps) {
  return (
    <details className="disclosure" data-testid={testId}>
      <summary className="disclosure-summary">
        {summary}
        <span className="chevron" aria-hidden="true" />
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
