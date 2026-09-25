import type { FeatureGated } from './lib/features.ts';

export type RouteId = 'oversikt' | 'logga' | 'mat' | 'kalender' | 'framsteg' | 'installningar';

export interface Route extends FeatureGated {
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
  { id: 'mat', path: '/mat', label: 'Mat', inNav: true, feature: 'mat' },
  { id: 'kalender', path: '/kalender', label: 'Kalender', inNav: true },
  { id: 'framsteg', path: '/framsteg', label: 'Framsteg', inNav: true },
  { id: 'installningar', path: '/installningar', label: 'Inställningar', inNav: false },
];

export const NAV_ROUTES: readonly Route[] = ROUTES.filter((r) => r.inNav);

export const DEFAULT_ROUTE: Route = ROUTES[0] as Route;

/** Gamla adresser som flyttat. Steg loggas under Logga; Historik och Bilder är flikar i Framsteg. */
const MOVED: Readonly<Record<string, string>> = {
  '/steg': '/logga',
  '/historik': '/framsteg',
  '/bilder': '/framsteg/bilder',
};

export interface RouteMatch {
  route: Route;
  /** Resten av sökvägen efter routens egen, t.ex. "bilder" i "#/framsteg/bilder". */
  sub: string;
}

/** Tolkar en location.hash (t.ex. "#/logga") till en route. Okänt → Översikt. */
export function matchHash(hash: string): RouteMatch {
  const raw = hash.replace(/^#/, '') || '/';
  const path = MOVED[raw] ?? raw;
  const [, first = '', ...rest] = path.split('/');
  const route = ROUTES.find((r) => r.path === `/${first}`) ?? DEFAULT_ROUTE;
  return { route, sub: route === DEFAULT_ROUTE ? '' : rest.join('/') };
}

export function routeFromHash(hash: string): Route {
  return matchHash(hash).route;
}

export function hrefFor(route: Route, sub?: string): string {
  return sub ? `#${route.path}/${sub}` : `#${route.path}`;
}
