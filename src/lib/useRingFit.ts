import { useLayoutEffect, type RefObject } from 'react';
import { RING_UNIT_RATIO, ringTextScale, rowTextScale, type RingLine } from './ringFit.ts';

/** `--ring-text-min` (t.ex. "0.6875rem") i px. */
function minTextPx(row: HTMLElement): number {
  const raw = getComputedStyle(row).getPropertyValue('--ring-text-min').trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  if (raw.endsWith('rem')) {
    return value * parseFloat(getComputedStyle(document.documentElement).fontSize);
  }
  return value;
}

function measureLine(el: HTMLElement, minPx: number): RingLine {
  const style = getComputedStyle(el);
  const size = parseFloat(style.fontSize);
  const lineHeight = parseFloat(style.lineHeight);
  const width = el.getBoundingClientRect().width;
  if (!(size > 0)) return { widthPerPx: 0, heightPerPx: 0, basePx: 0, minPx };
  // Enheten är mindre än siffran: siffran stannar där enheten når min-storleken.
  const hasUnit = el.querySelector('.goal-ring-unit') !== null;
  return {
    widthPerPx: width / size,
    heightPerPx: Number.isFinite(lineHeight) ? lineHeight / size : 1.2,
    basePx: size,
    minPx: hasUnit ? minPx / RING_UNIT_RATIO : minPx,
  };
}

/** Mät raden och sätt `--ring-scale`: samma textstorlek i alla ringar, styrd av den längsta texten. */
function fitRow(row: HTMLElement) {
  // Mät vid bastorleken (skala 1).
  row.style.setProperty('--ring-scale', '1');
  const minPx = minTextPx(row);
  const scales = [...row.querySelectorAll<HTMLElement>('.goal-ring')].map((ring) => {
    const lines = [...ring.querySelectorAll<HTMLElement>('.goal-ring-line')].map((el) =>
      measureLine(el, minPx),
    );
    return ringTextScale(lines, ring.getBoundingClientRect().width);
  });
  row.style.setProperty('--ring-scale', String(rowTextScale(scales)));
}

/**
 * Krymper texten i en rad ringar (`RingRow`) så att den ryms inom ringarnas inre cirkel. Körs efter
 * varje rendering (nya värden), när raden byter storlek och när typsnitten laddats.
 */
export function useRingFit(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    if (ref.current) fitRow(ref.current);
  });

  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    let width = row.getBoundingClientRect().width;
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            const next = row.getBoundingClientRect().width;
            if (next === width) return;
            width = next;
            fitRow(row);
          });
    observer?.observe(row);
    let active = true;
    // jsdom saknar document.fonts.
    if ('fonts' in document) {
      void document.fonts.ready.then(() => {
        if (active) fitRow(row);
      });
    }
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [ref]);
}
