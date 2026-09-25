import { useState } from 'react';
import type { AppData } from '../lib/useAppData.ts';
import { WorkoutForm } from './WorkoutForm.tsx';
import { WorkoutPlans } from './WorkoutPlans.tsx';

type Tab = 'pass' | 'schema';

interface WorkoutLogProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Logga → Träning: enstaka pass eller återkommande schema. */
export function WorkoutLog({ data, onChange }: WorkoutLogProps) {
  const [tab, setTab] = useState<Tab>('pass');
  return (
    <>
      <div className="segmented" role="group" aria-label="Träning">
        <button
          type="button"
          className="segmented-button"
          aria-pressed={tab === 'pass'}
          onClick={() => {
            setTab('pass');
          }}
        >
          Pass
        </button>
        <button
          type="button"
          className="segmented-button"
          aria-pressed={tab === 'schema'}
          onClick={() => {
            setTab('schema');
          }}
        >
          Återkommande
        </button>
      </div>
      {tab === 'pass' ? (
        <WorkoutForm data={data} onChange={onChange} />
      ) : (
        <WorkoutPlans data={data} onChange={onChange} />
      )}
    </>
  );
}
