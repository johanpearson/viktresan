import type { ReactNode } from 'react';
import { useFeatures, type FeatureId } from '../lib/features.ts';

/** Visar innehållet bara när funktionen är på. */
export function Feature({ id, children }: { id: FeatureId; children: ReactNode }) {
  const { isEnabled } = useFeatures();
  return isEnabled(id) ? children : null;
}
