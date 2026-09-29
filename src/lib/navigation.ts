import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { DEFAULT_ROUTE, hrefFor, matchHash } from '../routes.ts';

/**
 * Navigering och bakåtknappen. Historiken speglar appens hierarki, inte klickhistoriken:
 *
 *   Översikt (rot, djup 0) → flik (1) → undervy (2) → paneler/dialoger (överlägg, +1 per st)
 *
 * - Flikbyte från Översikt = ny post; mellan två andra flikar = ersätt posten (bakåt går alltid
 *   till Översikt). Översikt i navigeringen går tillbaka till roten i stället för att lägga till.
 * - Undervyer (t.ex. rapporten) = ny post ovanpå fliken.
 * - Överlägg (BottomSheet, skanner, kamera, bildvisning, firande) = ny post med samma adress;
 *   popstate stänger dem. Stängs de på annat sätt tas posten bort med history.go(-n).
 * - Djuplänkar och genvägar: vid start ersätts posten med Översikt och målet läggs ovanpå.
 * - En omladdning (t.ex. ny version) behåller historiken och lägger inte till något.
 *
 * All historikhantering i appen går genom den här modulen. Stackreglerna är rena funktioner
 * (`chainFor`, `planNavigation`) och testas för sig.
 */

export const ROOT_HASH = '#/';

/** Adressen i kanonisk form ("#/", "#/mat", "#/framsteg/rapport/visa"); flyttade adresser följs. */
export function normalizeHash(hash: string): string {
  const { route, sub } = matchHash(hash);
  return route === DEFAULT_ROUTE ? ROOT_HASH : hrefFor(route, sub);
}

/**
 * Posterna från roten till adressen: ["#/"], ["#/", "#/mat"] eller för en undervy
 * ["#/", "#/framsteg/rapport", "#/framsteg/rapport/visa"]. Längden − 1 = adressens nivå.
 */
export function chainFor(hash: string): string[] {
  const { route, sub } = matchHash(hash);
  if (route === DEFAULT_ROUTE) return [ROOT_HASH];
  const target = hrefFor(route, sub);
  if (route.subviews?.includes(sub)) {
    const parentSub = sub.split('/').slice(0, -1).join('/');
    return [ROOT_HASH, hrefFor(route, parentSub), target];
  }
  return [ROOT_HASH, target];
}

/** Var historiken står: `depth` = postens avstånd från roten, `page` = sidans djup (utan överlägg). */
export interface NavPosition {
  depth: number;
  page: number;
}

export interface NavPlan {
  /** Antal steg bakåt först (stänger överlägg och lämnar undervyer). */
  back: number;
  /** Ersätt posten man landar på (flikbyte), eller `null`. */
  replace: string | null;
  /** Poster att lägga till efteråt. */
  push: readonly string[];
}

/** Hur historiken ändras när man går från `from` (på adressen `hash`) till `target`. */
export function planNavigation(from: NavPosition & { hash: string }, target: string): NavPlan {
  const chain = chainFor(target);
  const goal = chain[chain.length - 1] ?? ROOT_HASH;
  const overlays = Math.max(0, from.depth - from.page);
  // Samma vy: stäng bara det som ligger ovanpå.
  if (goal === normalizeHash(from.hash)) return { back: overlays, replace: null, push: [] };
  // Översikt: tillbaka till roten.
  if (chain.length === 1) return { back: from.depth, replace: null, push: [] };
  // Från roten läggs fliken till; annars återanvänds flikposten (djup 1) för den nya fliken.
  if (from.page === 0) return { back: from.depth, replace: null, push: chain.slice(1) };
  return { back: from.depth - 1, replace: chain[1] ?? null, push: chain.slice(2) };
}

// --- Historiken -------------------------------------------------------------------------------

const STATE_KEY = 'viktresanNav';

/** En post under den nuvarande: adress och sidans djup. Index = postens djup. */
interface TrailEntry {
  hash: string;
  page: number;
}

function parseTrail(value: unknown): TrailEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const { hash, page } = item as Record<string, unknown>;
    return typeof hash === 'string' && typeof page === 'number' ? [{ hash, page }] : [];
  });
}

function readNav(): (NavPosition & { trail: TrailEntry[] }) | null {
  const state: unknown = window.history.state;
  if (typeof state !== 'object' || state === null) return null;
  const nav = (state as Record<string, unknown>)[STATE_KEY];
  if (typeof nav !== 'object' || nav === null) return null;
  const { depth, page, trail } = nav as Record<string, unknown>;
  if (typeof depth !== 'number' || typeof page !== 'number') return null;
  return { depth, page, trail: parseTrail(trail) };
}

function readState(): NavPosition | null {
  const nav = readNav();
  return nav && { depth: nav.depth, page: nav.page };
}

function urlFor(hash: string): string {
  const { pathname, search } = window.location;
  return `${pathname}${search}${hash}`;
}

let position: NavPosition = { depth: 0, page: 0 };
/** Adressen på posten som `position` gäller. */
let positionUrl = '';
/**
 * Posterna under den nuvarande. Sparas i varje post så att de kan läggas tillbaka om Chrome
 * hoppar över dem (se `repair`).
 */
let trail: TrailEntry[] = [];

function syncFromHistory(): void {
  const nav = readNav();
  position = nav ? { depth: nav.depth, page: nav.page } : { depth: 0, page: 0 };
  trail = nav?.trail ?? [];
  positionUrl = window.location.href;
}

function hashOf(url: string): string {
  const index = url.indexOf('#');
  return index === -1 ? '' : url.slice(index);
}

/**
 * Skriver en post. `push` (och en post som webbläsaren redan lagt till, `below: 'current'`)
 * ligger ovanpå den nuvarande; `replace` ersätter den.
 */
function writeEntry(
  kind: 'push' | 'replace',
  url: string,
  next: NavPosition,
  below: 'current' | 'same' = kind === 'push' ? 'current' : 'same',
): void {
  const nextTrail =
    below === 'current'
      ? [...trail, { hash: hashOf(positionUrl), page: position.page }]
      : [...trail];
  const state = { [STATE_KEY]: { ...next, trail: nextTrail.slice(0, next.depth) } };
  if (kind === 'push') window.history.pushState(state, '', url);
  else window.history.replaceState(state, '', url);
  position = next;
  trail = nextTrail.slice(0, next.depth);
  positionUrl = window.location.href;
}

// Chrome hoppar över poster som lagts till utan användaraktivering, även när sidan själv backar
// (och efter en omladdning gäller det poster från det förra dokumentet). Landar ett eget steg
// bakåt för lågt läggs de överhoppade posterna tillbaka ur `trail`. Förväntan sparas även i
// sessionStorage, eftersom steget kan ladda om sidan (poster från före en omladdning).
const EXPECT_KEY = 'viktresanNavExpect';

interface Expectation {
  depth: number;
  entries: TrailEntry[];
}

let expectation: Expectation | null = null;

function setExpectation(next: Expectation | null): void {
  expectation = next;
  try {
    if (next) sessionStorage.setItem(EXPECT_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(EXPECT_KEY);
  } catch {
    // Utan sessionStorage lagas bara steg inom samma dokument.
  }
}

function storedExpectation(): Expectation | null {
  try {
    const raw = sessionStorage.getItem(EXPECT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { depth?: unknown; entries?: unknown };
    return typeof value.depth === 'number'
      ? { depth: value.depth, entries: parseTrail(value.entries) }
      : null;
  } catch {
    return null;
  }
}

/** Lägger tillbaka poster som hoppades över mellan där steget landade och målet. */
function repair(target: Expectation | null): void {
  setExpectation(null);
  if (!target || position.depth >= target.depth) return;
  for (let depth = position.depth + 1; depth <= target.depth; depth += 1) {
    const entry = target.entries[depth];
    if (!entry) return;
    writeEntry('push', urlFor(entry.hash || ROOT_HASH), { depth, page: entry.page });
  }
}

// Adressändringar som inte ger hashchange (pushState/replaceState) meddelas här.
const locationListeners = new Set<() => void>();

function emitLocation(): void {
  for (const listener of locationListeners) listener();
}

/** Prenumerera på adressändringar (useHashRoute). */
export function subscribeLocation(listener: () => void): () => void {
  install();
  locationListeners.add(listener);
  return () => {
    locationListeners.delete(listener);
  };
}

// Steg bakåt som modulen själv startat. history.go är asynkront: under tiden köas allt annat.
let traversing = false;
let traversalTimer: number | undefined;
const queue: (() => void)[] = [];

/** Kör nu, eller när pågående steg bakåt är klart. */
function schedule(op: () => void): void {
  queue.push(op);
  drain();
}

function drain(): void {
  while (!traversing && queue.length > 0) queue.shift()?.();
}

function goBack(steps: number): void {
  const n = Math.min(steps, position.depth);
  if (n <= 0) return;
  const target = position.depth - n;
  setExpectation({ depth: target, entries: trail.slice(0, target + 1) });
  traversing = true;
  // Skulle popstate utebli (t.ex. historiken är kortare än väntat) fastnar inte kön.
  window.clearTimeout(traversalTimer);
  traversalTimer = window.setTimeout(() => {
    if (!traversing) return;
    traversing = false;
    setExpectation(null);
    if (readState()) syncFromHistory();
    drain();
  }, 1000);
  window.history.go(-n);
}

// --- Överlägg ---------------------------------------------------------------------------------

interface Overlay {
  level: number;
  close: () => void;
  dirty: () => boolean;
  /** Har en egen post i historiken. */
  entry: boolean;
  /** Postens adress (kan ha en delsökväg som sidans post saknar). */
  url: string;
  open: boolean;
}

/** Öppna överlägg, underst först. Post nr i hör till överlägget på plats i. */
const overlays: Overlay[] = [];
/**
 * Adressen till nästa överläggs post: panelen som en delsökväg öppnade (t.ex. "#/logga/vikt")
 * behåller den i sin post, så att en omladdning öppnar panelen igen.
 */
let nextOverlayUrl: string | null = null;
/** Poster vars överlägg stängts men som ännu inte tagits bort (görs samlat i en mikrouppgift). */
let pendingBack = 0;
let flushQueued = false;
/** Överläggsposter utan överlägg (efter omladdning eller lås), se `abandonOverlays`. */
let orphans = 0;
let pruneTimer: number | undefined;
/** Hur länge en ledig plats väntar på att panelen öppnas igen (data läses först). */
const PRUNE_MS = 2000;

function flushBack(): void {
  flushQueued = false;
  const n = pendingBack;
  pendingBack = 0;
  if (n > 0)
    schedule(() => {
      goBack(n);
    });
}

function openOverlay(overlay: Overlay): void {
  install();
  // Nästlade överlägg ligger ovanför föräldern även om barnet registreras först.
  let index = overlays.length;
  while (index > 0 && (overlays[index - 1]?.level ?? 0) > overlay.level) index -= 1;
  overlays.splice(index, 0, overlay);
  if (pendingBack > 0) {
    // Ett överlägg stängdes nyss (t.ex. radmenyn som öppnar ett formulär): ta över dess post.
    pendingBack -= 1;
    overlay.entry = true;
    overlay.url = window.location.href;
    return;
  }
  if (orphans > 0) {
    // Panelen öppnas igen efter omladdning eller upplåsning: posten finns redan.
    orphans -= 1;
    overlay.entry = true;
    overlay.url = window.location.href;
    return;
  }
  schedule(() => {
    if (!overlay.open) return;
    const url = nextOverlayUrl ?? window.location.href;
    nextOverlayUrl = null;
    writeEntry('push', url, { depth: position.depth + 1, page: position.page });
    overlay.entry = true;
    overlay.url = window.location.href;
    // Adressen i överläggets post kan skilja sig från sidans (delsökvägen).
    emitLocation();
  });
}

function releaseOverlay(overlay: Overlay): void {
  const index = overlays.indexOf(overlay);
  overlay.open = false;
  if (index === -1) return;
  overlays.splice(index, 1);
  if (!overlay.entry) return;
  // Stängd på annat sätt än med bakåt (knapp, svep, sparat): ta bort posten.
  pendingBack += 1;
  if (!flushQueued) {
    flushQueued = true;
    queueMicrotask(flushBack);
  }
}

// --- "Kasta ändringar?" -----------------------------------------------------------------------

let discardRequest: { discard: () => void } | null = null;
const discardListeners = new Set<() => void>();

function setDiscardRequest(next: { discard: () => void } | null): void {
  discardRequest = next;
  for (const listener of discardListeners) listener();
}

/**
 * Frågar "Kasta ändringar?" (DiscardPrompt). `discard` körs bara om användaren väljer Kasta.
 * Används av paneler med osparade ändringar när de ska stängas med bakåt.
 */
export function requestDiscard(discard: () => void): void {
  setDiscardRequest({ discard });
}

export interface DiscardPromptState {
  open: boolean;
  keep: () => void;
  discard: () => void;
}

function keepEditing(): void {
  setDiscardRequest(null);
}

function confirmDiscard(): void {
  const request = discardRequest;
  setDiscardRequest(null);
  request?.discard();
}

/** Tillståndet för DiscardPrompt. */
export function useDiscardPrompt(): DiscardPromptState {
  const open = useSyncExternalStore(
    (listener) => {
      discardListeners.add(listener);
      return () => {
        discardListeners.delete(listener);
      };
    },
    () => discardRequest !== null,
  );
  return { open, keep: keepEditing, discard: confirmDiscard };
}

// --- Händelser --------------------------------------------------------------------------------

/**
 * En post som modulen inte skapat: adressen ändrades utanför appen (inskriven adress, en
 * fragmentnavigering). Chrome skickar popstate utan state för dem. Posten märks så att djupen
 * stämmer; ny vy = ny sida (överläggen stängs), samma adress = allt öppet får vara kvar.
 */
function adoptEntry(): void {
  if (window.location.href === positionUrl) {
    const hasOverlays = position.depth > position.page;
    writeEntry(
      'replace',
      window.location.href,
      { depth: position.depth + 1, page: hasOverlays ? position.page : position.depth + 1 },
      'current',
    );
  } else {
    for (const overlay of overlays.splice(0).reverse()) {
      overlay.open = false;
      overlay.close();
    }
    writeEntry(
      'replace',
      window.location.href,
      { depth: position.depth + 1, page: position.depth + 1 },
      'current',
    );
  }
  emitLocation();
}

function onPopState(): void {
  nextOverlayUrl = null;
  const internal = traversing;
  traversing = false;
  window.clearTimeout(traversalTimer);
  const state = readState();
  if (state === null && !internal) {
    adoptEntry();
    drain();
    return;
  }
  syncFromHistory();
  if (internal) repair(expectation);

  const shouldBeOpen = Math.max(0, position.depth - position.page);
  const withEntry = overlays.filter((o) => o.entry);
  orphans = Math.min(orphans, Math.max(0, shouldBeOpen - withEntry.length));
  if (withEntry.length > shouldBeOpen) {
    const popped = withEntry.slice(shouldBeOpen);
    const top = popped[popped.length - 1];
    if (!internal && popped.length === 1 && top?.dirty()) {
      // Bakåt i en panel med osparade ändringar: lägg tillbaka posten och fråga först.
      writeEntry('push', top.url, {
        depth: position.depth + 1,
        page: position.page,
      });
      if (discardRequest) keepEditing();
      else requestDiscard(top.close);
      drain();
      return;
    }
    for (const overlay of popped.reverse()) {
      overlays.splice(overlays.indexOf(overlay), 1);
      overlay.open = false;
      overlay.close();
    }
    if (discardRequest) keepEditing();
  } else if (!internal && shouldBeOpen > withEntry.length + orphans) {
    // Framåt till en post för ett överlägg som inte längre är öppet: tillbaka till sidan.
    goBack(shouldBeOpen - withEntry.length - orphans);
  }
  drain();
  emitLocation();
}

function onHashChange(): void {
  // Webbläsare som inte skickar popstate för en ny fragmentpost.
  if (readState() === null) adoptEntry();
  else emitLocation();
}

/** Interna länkar (`href="#/…"`) går genom `navigate` i stället för att lägga till en post. */
function onClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target;
  const link = target instanceof Element ? target.closest('a[href]') : null;
  if (!(link instanceof HTMLAnchorElement)) return;
  if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return;
  const href = link.getAttribute('href') ?? '';
  if (!href.startsWith('#')) return;
  event.preventDefault();
  navigate(href);
}

let installed = false;

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  syncFromHistory();
  window.addEventListener('popstate', onPopState);
  window.addEventListener('hashchange', onHashChange);
  document.addEventListener('click', onClick);
}

// --- Publikt API ------------------------------------------------------------------------------

/**
 * Körs en gång vid start, före första renderingen. Ny start: posten blir Översikt och en
 * djuplänk läggs ovanpå (bakåt landar på Översikt). Omladdning: historiken finns redan –
 * inget läggs till, och en post för ett överlägg som inte längre är öppet lämnas.
 */
export function initNavigation(): Promise<void> {
  install();
  syncFromHistory();
  if (readState()) {
    // Omladdning: historiken finns redan. Landade ett eget steg bakåt i en post från före en
    // omladdning (ny sidladdning) och för lågt läggs posterna tillbaka. Ett överlägg som var
    // öppet får tillbaka sin post.
    repair(storedExpectation());
    abandonOverlays();
    return Promise.resolve();
  }
  setExpectation(null);
  const chain = chainFor(window.location.hash);
  writeEntry('replace', urlFor(ROOT_HASH), { depth: 0, page: 0 });
  chain.slice(1).forEach((hash, i) => {
    writeEntry('push', urlFor(hash), { depth: i + 1, page: i + 1 });
  });
  return Promise.resolve();
}

/**
 * Appens överlägg försvinner utan att stängas: vid en omladdning (t.ex. ny version) och när
 * appen låses. Deras poster blir lediga platser: ett överlägg som öppnas igen (en panel från en
 * delsökväg, t.ex. "#/installningar/las", som finns kvar i postens adress) tar över platsen i
 * stället för att lägga till en post. Platser som ingen tagit tas bort med `pruneOrphansSoon`.
 * (Chrome kan hoppa över poster som lagts till utan användaraktivering när sidan själv backar,
 * så det görs inte direkt vid start.)
 */
export function abandonOverlays(): void {
  install();
  schedule(() => {
    for (const overlay of overlays.splice(0)) {
      overlay.open = false;
      overlay.entry = false;
    }
    pendingBack = 0;
    nextOverlayUrl = null;
    orphans = Math.max(0, position.depth - position.page);
  });
}

/**
 * Tar bort lediga överläggsplatser som inget överlägg tagit över inom kort. Körs när appen
 * visas (App monteras: vid start och efter upplåsning).
 */
export function pruneOrphansSoon(): void {
  window.clearTimeout(pruneTimer);
  pruneTimer = window.setTimeout(() => {
    schedule(() => {
      const steps = orphans;
      orphans = 0;
      goBack(steps);
    });
  }, PRUNE_MS);
}

/** Gå till en adress enligt hierarkin (se modulkommentaren). */
export function navigate(target: string): void {
  install();
  schedule(() => {
    nextOverlayUrl = null;
    const plan = planNavigation({ ...position, hash: window.location.hash }, target);
    // Stegen bakåt tar först poster för redan stängda överlägg (pendingBack), sedan de
    // översta öppna överläggen: stäng dem direkt så att de inte själva backar en gång till.
    const withEntry = overlays.filter((o) => o.entry);
    const free = pendingBack + orphans;
    const doomed = Math.max(0, Math.min(plan.back, withEntry.length + free) - free);
    pendingBack = 0;
    orphans = 0;
    for (const overlay of withEntry.slice(withEntry.length - doomed).reverse()) {
      overlays.splice(overlays.indexOf(overlay), 1);
      overlay.open = false;
      overlay.entry = false;
      overlay.close();
    }
    const finish = () => {
      const depth = position.depth;
      if (plan.replace !== null && plan.replace !== normalizeHash(window.location.hash)) {
        writeEntry('replace', urlFor(plan.replace), { depth, page: depth });
      }
      plan.push.forEach((hash, i) => {
        writeEntry('push', urlFor(hash), { depth: depth + i + 1, page: depth + i + 1 });
      });
      emitLocation();
    };
    if (plan.back > 0) {
      goBack(plan.back);
      schedule(finish);
    } else {
      finish();
    }
  });
}

/**
 * En sida har öppnat panelen som delsökvägen pekar på (t.ex. "#/logga/vikt"): sidans post
 * blir `pageHash` ("#/logga") och panelens egen post (nästa överlägg) behåller delsökvägen.
 * Bakåt stänger då panelen och landar på sidan utan den; en omladdning öppnar den igen.
 */
export function consumeSubPath(pageHash: string): void {
  install();
  schedule(() => {
    const current = window.location.hash;
    if (position.depth !== position.page || current === pageHash) return;
    writeEntry('replace', urlFor(pageHash), position);
    nextOverlayUrl = urlFor(current);
    emitLocation();
  });
}

/** Byter hela adressen (t.ex. utan `?action=`) på nuvarande post, utan ny historikpost. */
export function replaceUrl(url: string): void {
  install();
  writeEntry('replace', url, position);
  emitLocation();
}

/** Nästlingsnivå: överlägg inuti en panel hamnar ovanför den i historiken. */
export const OverlayLevel = createContext(0);

interface OverlayOptions {
  /** Osparade ändringar: bakåt frågar "Kasta ändringar?" först. */
  dirty?: () => boolean;
}

/**
 * Registrerar ett överlägg (panel, dialog, helskärmsvy) medan komponenten är monterad:
 * en historikpost läggs till, bakåt anropar `close`, och stängs det på annat sätt tas
 * posten bort. Returnerar nivån som barnen ska få via `OverlayLevel`.
 */
export function useOverlay(close: () => void, options: OverlayOptions = {}): number {
  const level = useContext(OverlayLevel);
  const callbacks = useRef({ close, dirty: options.dirty });
  useEffect(() => {
    callbacks.current = { close, dirty: options.dirty };
  });
  useEffect(() => {
    const overlay: Overlay = {
      level,
      close: () => {
        callbacks.current.close();
      },
      dirty: () => callbacks.current.dirty?.() ?? false,
      entry: false,
      url: '',
      open: true,
    };
    openOverlay(overlay);
    return () => {
      releaseOverlay(overlay);
    };
  }, [level]);
  return level + 1;
}

/** Nollställer modulen (enhetstester). */
export function resetNavigationForTests(): void {
  overlays.splice(0);
  queue.splice(0);
  pendingBack = 0;
  traversing = false;
  window.clearTimeout(traversalTimer);
  discardRequest = null;
  nextOverlayUrl = null;
  orphans = 0;
  window.clearTimeout(pruneTimer);
  setExpectation(null);
  syncFromHistory();
}
