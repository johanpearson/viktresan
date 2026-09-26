import { formatInt } from '../lib/format.ts';
import { GoalRing } from './GoalRing.tsx';

interface NutritionRingsProps {
  kcal: number;
  targetKcal: number | null;
  proteinG: number;
  proteinGoalG: number | null;
  /** "idag" eller t.ex. ett datum – ingår i ringarnas namn. */
  when?: string;
}

/** Kalorier och protein mot dagens mål, sida vid sida (Översikt → Idag, Mat → Dag). */
export function NutritionRings({
  kcal,
  targetKcal,
  proteinG,
  proteinGoalG,
  when = 'idag',
}: NutritionRingsProps) {
  const k = Math.round(kcal);
  const p = Math.round(proteinG);
  return (
    <div className="nutrition-rings">
      <figure className="nutrition-ring">
        <GoalRing
          label={`Kalorier ${when}`}
          value={formatInt(k)}
          goal={targetKcal == null ? null : `av ${formatInt(targetKcal)}`}
          unit="kcal"
          fraction={targetKcal ? k / targetKcal : 0}
          variant="kcal"
          testId="kcal-ring"
        />
        <figcaption>Kalorier (kcal)</figcaption>
      </figure>
      <figure className="nutrition-ring">
        <GoalRing
          label={`Protein ${when}`}
          value={`${formatInt(p)} g`}
          goal={proteinGoalG == null ? null : `av ${formatInt(proteinGoalG)} g`}
          fraction={proteinGoalG ? p / proteinGoalG : 0}
          variant="protein"
          testId="protein-ring"
        />
        <figcaption>Protein</figcaption>
      </figure>
    </div>
  );
}
