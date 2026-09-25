import type { RouteId } from '../routes.ts';

const PATHS: Record<RouteId, string> = {
  oversikt: 'M4 19h16M6 16l4-5 3 3 5-7',
  logga: 'M12 5v14M5 12h14',
  bilder: 'M4 7h3l2-2h6l2 2h3v12H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  historik: 'M4 6h16M4 12h16M4 18h10',
  steg: 'M5 20v-6M10 20V8M15 20v-9M20 20V5',
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
