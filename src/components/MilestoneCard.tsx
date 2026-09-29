import { useEffect, useState } from 'react';
import { listMilestones, type MilestoneRecord } from '../db/db.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { formatDate } from '../lib/format.ts';
import { milestoneMessage, newestMilestone } from '../lib/milestones.ts';
import { onMilestonesSaved } from '../lib/milestoneSync.ts';
import { setPreference, usePreferences } from '../lib/preferences.ts';
import { Card } from './Card.tsx';
import { ListRow } from './ListRow.tsx';

interface MilestoneCardProps {
  now: Date;
}

/**
 * Översikt: kontextkortet "Ny milstolpe" – den senast nådda milstolpen den senaste veckan.
 * Tryck = Framsteg → Milstolpar; Stäng döljer just den milstolpen.
 */
export function MilestoneCard({ now }: MilestoneCardProps) {
  const { loaded, prefs } = usePreferences();
  const features = useFeatures();
  const [records, setRecords] = useState<MilestoneRecord[] | null>(null);

  useEffect(() => {
    let active = true;
    const read = () => {
      void listMilestones().then((r) => {
        if (active) setRecords(r);
      });
    };
    read();
    const unsubscribe = onMilestonesSaved(read);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!loaded || records === null) return null;
  const today = todayIso(now);
  const newest = newestMilestone(records, {
    today,
    dismissed: prefs.milestoneCardDismissed,
    isEnabled: (m) => features.isEnabled(m.feature),
  });
  if (!newest) return null;
  const { milestone, date } = newest;

  return (
    <Card
      title="Ny milstolpe"
      tone="success"
      testId="milestone-card"
      action={
        <button
          type="button"
          className="button button-ghost button-small"
          aria-label="Stäng milstolpen"
          onClick={() => void setPreference('milestoneCardDismissed', milestone.id)}
        >
          Stäng
        </button>
      }
    >
      <ul className="list">
        <ListRow
          leading={
            <span className="milestone-badge" aria-hidden="true">
              {milestone.badge}
            </span>
          }
          primary={milestone.title}
          secondary={`${formatDate(date)} · ${milestoneMessage(milestone, date)}`}
          href="#/framsteg/milstolpar"
          chevron
        />
      </ul>
    </Card>
  );
}
