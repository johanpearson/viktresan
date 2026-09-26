import { useEffect, useRef } from 'react';
import { onDataChange } from '../db/db.ts';
import { celebrate, dismissCelebration, useCelebration } from '../lib/celebration.ts';
import type { Features } from '../lib/features.ts';
import { syncMilestones } from '../lib/milestoneSync.ts';
import { CelebrationOverlay } from './CelebrationOverlay.tsx';
import { MilestoneToast } from './MilestoneToast.tsx';

/** Väntetid efter en sparning innan milstolparna utvärderas (flera sparningar slås ihop). */
const SETTLE_MS = 150;

/**
 * Utvärderar milstolpar och visar firandet. Vid start markeras redan passerade milstolpar
 * utan firande; efter varje relevant sparning firas de som nyss nåddes.
 */
export function MilestoneCenter({ features }: { features: Features }) {
  const isEnabled = useRef(features.isEnabled);
  const current = useCelebration();

  useEffect(() => {
    isEnabled.current = features.isEnabled;
  });

  useEffect(() => {
    void syncMilestones({ mode: 'silent' }).catch(() => undefined);
    let timer: number | undefined;
    const off = onDataChange(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void syncMilestones({
          mode: 'live',
          isEnabled: (m) => isEnabled.current(m.feature),
        })
          .then(celebrate)
          .catch(() => undefined);
      }, SETTLE_MS);
    });
    return () => {
      window.clearTimeout(timer);
      off();
    };
  }, []);

  if (!current) return null;
  // Ny nyckel per firande så att animationen startar om.
  const key = `${current.milestone.id}:${current.date}`;
  return current.milestone.size === 'stor' ? (
    <CelebrationOverlay key={key} celebration={current} onClose={dismissCelebration} />
  ) : (
    <MilestoneToast key={key} celebration={current} onClose={dismissCelebration} />
  );
}
