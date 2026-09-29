import { useSyncExternalStore } from 'react';
import { matchHash, type RouteMatch } from '../routes.ts';
import { subscribeLocation } from './navigation.ts';

function subscribe(onChange: () => void): () => void {
  // hashchange (bakåt/framåt, inskriven adress) och navigationsmodulens pushState/replaceState.
  window.addEventListener('hashchange', onChange);
  const unsubscribe = subscribeLocation(onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    unsubscribe();
  };
}

function getHash(): string {
  return window.location.hash;
}

/**
 * Hash-baserad routing: fungerar på GitHub Pages (ingen server-fallback behövs)
 * och offline via service workern. Historiken sköts av navigation.ts.
 */
export function useHashRoute(): RouteMatch {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  return matchHash(hash);
}
