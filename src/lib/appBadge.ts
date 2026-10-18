/**
 * Siffran på appikonen (Badging API) när appen är installerad: antal saker kvar i Översikt →
 * Att göra idag. Saknas stödet (de flesta webbläsare utanför en installerad app) händer inget.
 */
export function setAppBadge(count: number): void {
  if (!('setAppBadge' in navigator)) return;
  const done = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
  // Nekad behörighet eller ingen installerad app: ikonen är inte viktig nog för ett fel.
  done.catch(() => undefined);
}
