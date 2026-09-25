/**
 * Service worker och uppdateringar.
 *
 * Service workern (vite-plugin-pwa, `registerType: 'prompt'`) tar inte över
 * automatiskt när en ny version finns. I stället:
 *  1. Vi letar efter uppdateringar vid start och när appen blir synlig igen
 *     (högst var 30:e minut), eller när användaren trycker "Sök efter uppdatering".
 *  2. När en ny service worker väntar visas en toast. "Uppdatera" skickar
 *     SKIP_WAITING och laddar om sidan när den nya workern tagit kontroll.
 *
 * sw.js registreras med `updateViaCache: 'none'` så att webbläsarens HTTP-cache
 * (GitHub Pages: max-age=600) aldrig döljer en ny version. sw.js ingår inte i
 * precachen och index.html precachas med revision – en ny build ger alltså alltid
 * en ny sw.js.
 */
import { useSyncExternalStore } from 'react';

export const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
/** Hur länge vi väntar på att en ny service worker installeras efter en manuell sökning. */
const INSTALL_TIMEOUT_MS = 30_000;

export type UpdateCheckResult = 'available' | 'latest' | 'failed' | 'unsupported';

interface State {
  /** En ny service worker väntar på att få ta över. */
  waiting: boolean;
  /** Användaren har valt "Senare" för den här versionen. */
  dismissed: boolean;
}

let state: State = { waiting: false, dismissed: false };
let registration: ServiceWorkerRegistration | null = null;
let lastCheck = 0;
let reloading = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<State>): void {
  const next = { ...state, ...patch };
  if (next.waiting === state.waiting && next.dismissed === state.dismissed) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getState(): State {
  return state;
}

/** Sant när toasten "Ny version finns" ska visas. */
export function useUpdateAvailable(): boolean {
  const { waiting, dismissed } = useSyncExternalStore(subscribe, getState);
  return waiting && !dismissed;
}

/** Ska vi söka igen? Högst en automatisk sökning per intervall. */
export function shouldCheck(last: number, now: number, interval = UPDATE_INTERVAL_MS): boolean {
  return now - last >= interval;
}

function swContainer(): ServiceWorkerContainer | null {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker
    : null;
}

/** Styr en service worker redan sidan? Annars är en installerad worker den första, inte en uppdatering. */
function hasController(): boolean {
  return swContainer()?.controller != null;
}

/** Följer registreringen och flaggar när en ny service worker väntar. */
export function watchRegistration(reg: ServiceWorkerRegistration): void {
  registration = reg;
  if (reg.waiting && hasController()) setState({ waiting: true });
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' && hasController()) setState({ waiting: true });
    });
  });
}

function waitUntilInstalled(sw: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      sw.removeEventListener('statechange', onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (sw.state !== 'installing') done();
    };
    const timer = setTimeout(done, INSTALL_TIMEOUT_MS);
    sw.addEventListener('statechange', onChange);
    onChange();
  });
}

/** Frågar servern efter en ny sw.js och väntar in en eventuell installation. */
export async function checkForUpdate(now = Date.now()): Promise<UpdateCheckResult> {
  const reg = registration;
  if (!reg) return 'unsupported';
  lastCheck = now;
  try {
    await reg.update();
  } catch {
    return 'failed';
  }
  if (reg.installing) await waitUntilInstalled(reg.installing);
  if (reg.waiting && hasController()) {
    // En manuell sökning visar toasten igen även om den avfärdats.
    setState({ waiting: true, dismissed: false });
    return 'available';
  }
  return 'latest';
}

/** Automatisk sökning, t.ex. när appen blir synlig. Hoppar över om det är för tidigt. */
export async function maybeCheckForUpdate(now = Date.now()): Promise<void> {
  if (!registration || !shouldCheck(lastCheck, now)) return;
  await checkForUpdate(now);
}

/** Låter den väntande service workern ta över och laddar om sidan när den gjort det. */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  const container = swContainer();
  if (!waiting || !container) {
    window.location.reload();
    return;
  }
  container.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function dismissUpdate(): void {
  setState({ dismissed: true });
}

/** Registrerar service workern (bara i produktionsbygget) och startar uppdateringskontrollerna. */
export async function registerServiceWorker(): Promise<void> {
  const container = swContainer();
  if (!container) return;
  const base = import.meta.env.BASE_URL;
  // Blockerade service workers (t.ex. i vissa testmiljöer) kan ge undefined.
  let reg: ServiceWorkerRegistration;
  try {
    reg = await container.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' });
  } catch {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- se ovan
  if (!reg) return;
  watchRegistration(reg);
  void checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void maybeCheckForUpdate();
  });
}

export function resetUpdateForTests(): void {
  state = { waiting: false, dismissed: false };
  registration = null;
  lastCheck = 0;
  reloading = false;
}
