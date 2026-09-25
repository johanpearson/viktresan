import type { RouteId } from '../routes.ts';

const PATHS: Record<RouteId, string> = {
  oversikt: 'M3 11l9-8 9 8M5 9.5V20h5v-6h4v6h5V9.5',
  logga: 'M12 5v14M5 12h14',
  mat: 'M6 3v7a2 2 0 0 0 4 0V3M8 3v18M17 21V3c-2 1-3 4-3 8h3',
  kalender: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  framsteg: 'M4 19h16M6 16l4-5 3 3 5-7',
  installningar:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.3-1.3.2-2-3-1-1 2h-1.8l-1-2-3 1 .2 2L6 7.2 4 7 3 10l2 1v2l-2 1 1 3 2-.2 1.3 1.3-.2 2 3 1 1-2h1.8l1 2 3-1-.2-2 1.3-1.3 2 .2 1-3-2-1z',
};

export function NavIcon({ id }: { id: RouteId }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[id]} />
    </svg>
  );
}
