import { useEffect, useRef, type ReactNode } from 'react';

interface PageProps {
  title: string;
  children?: ReactNode;
}

export function Page({ title, children }: PageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Flytta fokus till rubriken vid sidbyte så att skärmläsare annonserar sidan.
  useEffect(() => {
    document.title = `${title} – Viktresan`;
    headingRef.current?.focus();
  }, [title]);

  return (
    <section className="page" aria-labelledby="page-title">
      <h1 id="page-title" className="page-title" tabIndex={-1} ref={headingRef}>
        {title}
      </h1>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
