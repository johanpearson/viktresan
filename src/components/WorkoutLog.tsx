import { useState } from 'react';
import type { AppData } from '../lib/useAppData.ts';
import { SegmentedControl } from './SegmentedControl.tsx';
import { WorkoutForm } from './WorkoutForm.tsx';
import { WorkoutPlans } from './WorkoutPlans.tsx';

type Tab = 'pass' | 'schema';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'pass', label: 'Pass' },
  { id: 'schema', label: 'Återkommande' },
];

interface WorkoutLogProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Logga → Träning: enstaka pass eller återkommande schema. */
export function WorkoutLog({ data, onChange }: WorkoutLogProps) {
  const [tab, setTab] = useState<Tab>('pass');
  return (
    <>
      <SegmentedControl label="Träning" options={TABS} value={tab} onChange={setTab} />
      {tab === 'pass' ? (
        <WorkoutForm data={data} onChange={onChange} />
      ) : (
        <WorkoutPlans data={data} onChange={onChange} />
      )}
    </>
  );
}
