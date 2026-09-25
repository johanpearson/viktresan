import { useEffect, useState } from 'react';
import { EmptyState, Page } from '../components/Page.tsx';
import { WeightChart } from '../components/WeightChart.tsx';
import { listWeights, type WeightEntry } from '../db/db.ts';

export function Oversikt() {
  const [entries, setEntries] = useState<WeightEntry[] | null>(null);

  useEffect(() => {
    let active = true;
    listWeights().then(
      (result) => {
        if (active) setEntries(result);
      },
      () => {
        if (active) setEntries([]);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <Page title="Översikt">
      {entries === null ? null : entries.length > 1 ? (
        <div className="card">
          <WeightChart entries={entries} />
        </div>
      ) : (
        <EmptyState>Här visas din viktkurva när du har loggat några mätningar.</EmptyState>
      )}
    </Page>
  );
}
