import { useEffect, useState } from 'react';
import { Card } from '../components/Card.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { ListRow } from '../components/ListRow.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { listMilestones, type MilestoneRecord } from '../db/db.ts';
import { useCelebration } from '../lib/celebration.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { formatDate } from '../lib/format.ts';
import { onMilestonesSaved, readMilestoneInput } from '../lib/milestoneSync.ts';
import {
  describeMilestone,
  evaluateMilestones,
  upcomingMilestones,
  type MilestoneCandidate,
  type ReachedMilestone,
} from '../lib/milestones.ts';

interface Loaded {
  reached: ReachedMilestone[];
  candidates: MilestoneCandidate[];
  stored: Set<string>;
  hasProfile: boolean;
}

/** Framsteg → Milstolpar: uppnådda milstolpar med datum och de tre närmaste kommande. */
export function Milstolpar() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const features = useFeatures();
  // Läs om när ett nytt firande visas (en milstolpe har just sparats) …
  const celebration = useCelebration();
  // … och när en körning utan firande sparat milstolpar (vid start kan sidan läsas före den).
  const [saved, setSaved] = useState(0);
  useEffect(
    () =>
      onMilestonesSaved(() => {
        setSaved((n) => n + 1);
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([listMilestones(), readMilestoneInput()]).then(([records, input]) => {
      if (!active) return;
      setLoaded({
        reached: toReached(records),
        candidates: evaluateMilestones(input, todayIso()),
        stored: new Set(records.map((r) => r.id)),
        hasProfile: input.profile !== null,
      });
    });
    return () => {
      active = false;
    };
  }, [celebration, saved]);

  if (!loaded) return <Skeleton cards={2} lines={3} />;
  const reached = loaded.reached.filter((r) => features.isEnabled(r.milestone.feature));
  const upcoming = upcomingMilestones(
    loaded.candidates.filter((c) => features.isEnabled(c.milestone.feature)),
    loaded.stored,
  );

  return (
    <>
      {upcoming.length > 0 ? (
        <Card title="Nästa milstolpar">
          <ul className="list" data-testid="upcoming-milestones">
            {upcoming.map((c) => (
              <ListRow
                key={c.milestone.id}
                testId={`milestone-${c.milestone.id}`}
                leading={<Badge text={c.milestone.badge} upcoming />}
                primary={c.milestone.title}
                secondary={
                  <ProgressBar
                    thin
                    fraction={c.progress}
                    label={`Framsteg mot ${c.milestone.title}`}
                    className="milestone-progress"
                  />
                }
                value={<span className="milestone-remaining">{c.remaining}</span>}
              />
            ))}
          </ul>
        </Card>
      ) : loaded.hasProfile ? (
        <Card title="Nästa milstolpar">
          <p className="muted">Du har nått alla milstolpar som finns just nu. Starkt!</p>
        </Card>
      ) : (
        <EmptyState
          title="Fler milstolpar med en profil"
          action={{ label: 'Fyll i profilen', href: '#/installningar/profil' }}
        >
          Med startvikt, längd och mål visas milstolpar för kilon, procent, BMI och målet här.
        </EmptyState>
      )}

      {reached.length === 0 ? (
        <EmptyState
          title="Inga milstolpar än"
          action={{ label: 'Logga vikt', href: '#/logga/vikt' }}
        >
          Här samlas dina milstolpar – första kilot, loggade dagar, pass och mycket mer.
        </EmptyState>
      ) : (
        <Card title="Uppnådda">
          <ol className="list" data-testid="reached-milestones">
            {[...reached].reverse().map((r) => (
              <ListRow
                key={r.milestone.id}
                testId={`milestone-${r.milestone.id}`}
                leading={<Badge text={r.milestone.badge} />}
                primary={r.milestone.title}
                value={formatDate(r.date)}
              />
            ))}
          </ol>
        </Card>
      )}
    </>
  );
}

/** Milstolpens märke framför raden: fyllt när den är nådd, tonat när den är kommande. */
function Badge({ text, upcoming = false }: { text: string; upcoming?: boolean }) {
  return (
    <span
      className={upcoming ? 'milestone-badge milestone-badge-upcoming' : 'milestone-badge'}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

/** Sparade milstolpar → beskrivning. Okända id:n (från en nyare app) hoppas över. */
function toReached(records: readonly MilestoneRecord[]): ReachedMilestone[] {
  const result: ReachedMilestone[] = [];
  for (const record of records) {
    const milestone = describeMilestone(record.id);
    if (milestone) result.push({ milestone, date: record.date });
  }
  return result;
}
