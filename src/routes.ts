export type RouteId = 'oversikt' | 'logga' | 'historik' | 'mat' | 'bilder' | 'installningar';

export interface Route {
  id: RouteId;
  path: string;
  label: string;
  /** Visas i bottennavigeringen. Inställningar nås via kugghjulet på Översikt. */
  inNav: boolean;
}

/** Ordningen här styr ordningen i navigeringen. */
export const ROUTES: readonly Route[] = [
  { id: 'oversikt', path: '/', label: 'Översikt', inNav: true },
  { id: 'logga', path: '/logga', label: 'Logga', inNav: true },
  { id: 'historik', path: '/historik', label: 'Historik', inNav: true },
  { id: 'mat', path: '/mat', label: 'Mat', inNav: true },
  { id: 'bilder', path: '/bilder', label: 'Bilder', inNav: true },
  { id: 'installningar', path: '/installningar', label: 'Inställningar', inNav: false },
];

export const NAV_ROUTES: readonly Route[] = ROUTES.filter((r) => r.inNav);

export const DEFAULT_ROUTE: Route = ROUTES[0] as Route;

/** Gamla adresser som flyttat. Steg loggas numera under Logga. */
const MOVED: Readonly<Record<string, string>> = { '/steg': '/logga' };

/** Tolkar en location.hash (t.ex. "#/logga") till en route. Okänt → Översikt. */
export function routeFromHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const path = MOVED[raw] ?? raw;
  return ROUTES.find((r) => r.path === path) ?? DEFAULT_ROUTE;
}

export function hrefFor(route: Route): string {
  return `#${route.path}`;
}
