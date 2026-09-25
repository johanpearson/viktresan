import { useSyncExternalStore } from 'react';
import { matchHash, type RouteMatch } from '../routes.ts';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

function getHash(): string {
  return window.location.hash;
}

/**
 * Hash-baserad routing: fungerar på GitHub Pages (ingen server-fallback behövs)
 * och offline via service workern.
 */
export function useHashRoute(): RouteMatch {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  return matchHash(hash);
}
