import { useEffect, useRef, useState, type ReactNode } from 'react';

interface PageProps {
  title: string;
  /** Valfri åtgärd till höger om rubriken, t.ex. en ikonlänk eller flikar. */
  action?: ReactNode;
  children?: ReactNode;
}

/**
 * Sida med sticky rubrikrad. När sidan scrollas krymper rubriken (bara visuellt,
 * `transform`, så att layouten inte hoppar) och raden får en skugga.
 */
export function Page({ title, action, children }: PageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  // Flytta fokus till rubriken vid sidbyte så att skärmläsare annonserar sidan.
  useEffect(() => {
    document.title = `${title} – Viktresan`;
    headingRef.current?.focus();
  }, [title]);

  // Raden är "fastnad" när markören ovanför den scrollats ut ur bild.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <section className="page" aria-labelledby="page-title">
      <div className="page-sentinel" ref={sentinelRef} aria-hidden="true" />
      <div className="page-header" data-stuck={stuck ? 'true' : 'false'}>
        <h1 id="page-title" className="page-title" tabIndex={-1} ref={headingRef}>
          {title}
        </h1>
        {action}
      </div>
      {children}
    </section>
  );
}
