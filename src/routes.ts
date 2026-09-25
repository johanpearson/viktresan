export type RouteId = 'oversikt' | 'logga' | 'historik' | 'steg' | 'bilder' | 'installningar';

export interface Route {
  id: RouteId;
  path: string;
  label: string;
}

/** Ordningen här styr ordningen i navigeringen. */
export const ROUTES: readonly Route[] = [
  { id: 'oversikt', path: '/', label: 'Översikt' },
  { id: 'logga', path: '/logga', label: 'Logga' },
  { id: 'historik', path: '/historik', label: 'Historik' },
  { id: 'steg', path: '/steg', label: 'Steg' },
  { id: 'bilder', path: '/bilder', label: 'Bilder' },
  { id: 'installningar', path: '/installningar', label: 'Inställningar' },
];

export const DEFAULT_ROUTE: Route = ROUTES[0] as Route;

/** Tolkar en location.hash (t.ex. "#/logga") till en route. Okänt → Översikt. */
export function routeFromHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  return ROUTES.find((r) => r.path === path) ?? DEFAULT_ROUTE;
}

export function hrefFor(route: Route): string {
  return `#${route.path}`;
}
