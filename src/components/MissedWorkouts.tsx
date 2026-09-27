import { useState } from 'react';
import type { AppData } from '../lib/useAppData.ts';
import { findUnanswered } from '../lib/workouts.ts';
import { Card } from './Card.tsx';
import { ShowMore } from './ShowMore.tsx';
import { WorkoutList } from './WorkoutList.tsx';

interface MissedWorkoutsProps {
  data: AppData;
  now: Date;
  onChange: () => Promise<unknown>;
}

/** Så många obesvarade pass visas innan "Visa alla". */
const VISIBLE = 3;

/** Överst på Översikt: planerade pass vars tid passerat, tills de är besvarade. */
export function MissedWorkouts({ data, now, onChange }: MissedWorkoutsProps) {
  const [all, setAll] = useState(false);
  const missed = findUnanswered(data.workouts, data.workoutPlans, now);
  if (missed.length === 0) return null;
  const shown = all ? missed : missed.slice(0, VISIBLE);
  return (
    <Card title="Blev passet av?" tone="warning" className="missed-card" testId="missed-workouts">
      <WorkoutList
        items={shown}
        mode="prompt"
        now={now}
        onChange={onChange}
        showDate
        label="Obesvarade pass"
      />
      <ShowMore
        hidden={missed.length - shown.length}
        onClick={() => {
          setAll(true);
        }}
      >
        Visa alla {missed.length} obesvarade
      </ShowMore>
    </Card>
  );
}
