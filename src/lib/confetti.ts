/**
 * Konfetti med canvas-confetti (bundlad, inget CDN). Ritar på en egen canvas och utan
 * web worker – en worker från en blob-URL skulle bryta mot CSP:n. Respekterar
 * prefers-reduced-motion: då ritas ingenting.
 */
import { create } from 'canvas-confetti';
import type { MilestoneSize } from './milestones.ts';

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function colors(): string[] {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return [read('--accent'), read('--chart-goal'), read('--macro-fat'), read('--dot-water')].filter(
    (c) => c !== '',
  );
}

/**
 * Stor milstolpe: flera salvor från båda sidor. Liten: en kort, diskret salva uppifrån.
 * Returnerar en funktion som avbryter animationen.
 */
export function fireConfetti(canvas: HTMLCanvasElement, size: MilestoneSize): () => void {
  if (prefersReducedMotion()) return () => undefined;
  let fire: ReturnType<typeof create>;
  try {
    fire = create(canvas, { resize: true, useWorker: false, disableForReducedMotion: true });
  } catch {
    return () => undefined;
  }
  const palette = colors();
  const base = palette.length > 0 ? { colors: palette } : {};
  const timers: number[] = [];
  if (size === 'stor') {
    const salvo = () => {
      void fire({ ...base, particleCount: 70, spread: 70, angle: 60, origin: { x: 0, y: 0.7 } });
      void fire({ ...base, particleCount: 70, spread: 70, angle: 120, origin: { x: 1, y: 0.7 } });
    };
    salvo();
    timers.push(window.setTimeout(salvo, 350), window.setTimeout(salvo, 800));
    void fire({ ...base, particleCount: 120, spread: 100, startVelocity: 45, origin: { y: 0.4 } });
  } else {
    void fire({
      ...base,
      particleCount: 35,
      spread: 55,
      startVelocity: 25,
      scalar: 0.8,
      gravity: 1.2,
      ticks: 120,
      origin: { y: 0.1 },
    });
  }
  return () => {
    for (const t of timers) window.clearTimeout(t);
    fire.reset();
  };
}
