import { useEffect, useState } from 'react';
import { EmptyState } from '../components/Page.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { listMilestones, type MilestoneRecord } from '../db/db.ts';
import { useCelebration } from '../lib/celebration.ts';
import { todayIso } from '../lib/dates.ts';
import { useFeatures } from '../lib/features.ts';
import { formatDate } from '../lib/format.ts';
import { readMilestoneInput } from '../lib/milestoneSync.ts';
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
  // Läs om när ett nytt firande visas (en milstolpe har just sparats).
  const celebration = useCelebration();

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
  }, [celebration]);

  if (!loaded) return null;
  const reached = loaded.reached.filter((r) => features.isEnabled(r.milestone.feature));
  const upcoming = upcomingMilestones(
    loaded.candidates.filter((c) => features.isEnabled(c.milestone.feature)),
    loaded.stored,
  );

  return (
    <>
      <section className="card" aria-labelledby="upcoming-milestones-title">
        <h2 className="card-title" id="upcoming-milestones-title">
          Nästa milstolpar
        </h2>
        {upcoming.length === 0 ? (
          <p className="muted">
            {loaded.hasProfile ? (
              'Du har nått alla milstolpar som finns just nu. Starkt!'
            ) : (
              <>
                Fyll i din profil under <a href="#/installningar">Inställningar</a> så visas fler
                milstolpar här.
              </>
            )}
          </p>
        ) : (
          <ul className="milestone-list" data-testid="upcoming-milestones">
            {upcoming.map((c) => (
              <li key={c.milestone.id} className="milestone-item" data-milestone={c.milestone.id}>
                <span className="milestone-badge milestone-badge-upcoming" aria-hidden="true">
                  {c.milestone.badge}
                </span>
                <div className="milestone-body">
                  <p className="milestone-title">{c.milestone.title}</p>
                  <p className="milestone-meta muted">{c.remaining}</p>
                  <ProgressBar fraction={c.progress} label={`Framsteg mot ${c.milestone.title}`} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="reached-milestones-title">
        <h2 className="card-title" id="reached-milestones-title">
          Uppnådda
        </h2>
        {reached.length === 0 ? (
          <EmptyState>
            Här samlas dina milstolpar – första kilot, loggade dagar, pass och mycket mer.
          </EmptyState>
        ) : (
          <ol className="milestone-list" data-testid="reached-milestones">
            {[...reached].reverse().map((r) => (
              <li key={r.milestone.id} className="milestone-item" data-milestone={r.milestone.id}>
                <span className="milestone-badge" aria-hidden="true">
                  {r.milestone.badge}
                </span>
                <div className="milestone-body">
                  <p className="milestone-title">{r.milestone.title}</p>
                  <p className="milestone-meta muted">{formatDate(r.date)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
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
