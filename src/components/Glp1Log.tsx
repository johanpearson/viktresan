import { useState } from 'react';
import type { AppData } from '../lib/useAppData.ts';
import { InjectionForm } from './InjectionForm.tsx';
import { NextDoseCard } from './NextDoseCard.tsx';
import { Medications } from './Medications.tsx';
import { SegmentedControl } from './SegmentedControl.tsx';
import { SymptomForm } from './SymptomForm.tsx';

type Tab = 'dos' | 'maende' | 'lakemedel';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'dos', label: 'Dos' },
  { id: 'maende', label: 'Mående' },
  { id: 'lakemedel', label: 'Läkemedel' },
];

interface Glp1LogProps {
  data: AppData;
  onChange: () => Promise<AppData>;
}

/** Logga → GLP-1: dos (med nästa dos), mående och läkemedel med dostrappa. */
export function Glp1Log({ data, onChange }: Glp1LogProps) {
  const [tab, setTab] = useState<Tab>(() => (data.medications.length > 0 ? 'dos' : 'lakemedel'));
  return (
    <>
      <SegmentedControl label="GLP-1" options={TABS} value={tab} onChange={setTab} />
      {tab === 'dos' && data.medications.length > 0 && (
        <NextDoseCard data={data} now={new Date()} />
      )}
      {tab === 'dos' && (
        <InjectionForm
          data={data}
          onChange={onChange}
          onAddMedication={() => {
            setTab('lakemedel');
          }}
        />
      )}
      {tab === 'maende' && <SymptomForm data={data} onChange={onChange} />}
      {tab === 'lakemedel' && <Medications data={data} onChange={onChange} />}
    </>
  );
}
