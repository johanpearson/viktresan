/**
 * Firanden som väntar på att visas. En sparning som når flera milstolpar på en gång ger
 * ett firande (den viktigaste) med en hänvisning till resten. Delas via useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';
import { milestoneMessage, type Milestone, type ReachedMilestone } from './milestones.ts';

export interface Celebration {
  milestone: Milestone;
  date: string;
  message: string;
  /** Andra milstolpar som nåddes samtidigt. */
  others: number;
}

let queue: readonly Celebration[] = [];
const listeners = new Set<() => void>();

function emit(next: readonly Celebration[]): void {
  queue = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCurrent(): Celebration | null {
  return queue[0] ?? null;
}

/** Köar ett firande för de nyss nådda milstolparna (viktigast först). */
export function celebrate(reached: readonly ReachedMilestone[]): void {
  const [top] = reached;
  if (!top) return;
  emit([
    ...queue,
    {
      milestone: top.milestone,
      date: top.date,
      message: milestoneMessage(top.milestone, top.date),
      others: reached.length - 1,
    },
  ]);
}

export function dismissCelebration(): void {
  emit(queue.slice(1));
}

export function resetCelebrationsForTests(): void {
  queue = [];
}

export function useCelebration(): Celebration | null {
  return useSyncExternalStore(subscribe, getCurrent);
}
