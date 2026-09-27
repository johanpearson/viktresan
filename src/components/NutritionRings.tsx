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

/**
 * Kalorier och protein mot dagens mål som två ringar (figurer). Läggs i en
 * `.rings`-rad av den som använder dem (Översikt → Idag, tillsammans med dryck).
 */
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
    <>
      <figure className="ring-figure">
        <GoalRing
          label={`Kalorier ${when}`}
          value={formatInt(k)}
          goal={targetKcal == null ? null : `av ${formatInt(targetKcal)}`}
          unit="kcal"
          fraction={targetKcal ? k / targetKcal : 0}
          tone="food"
          testId="kcal-ring"
        />
        <figcaption>Kalorier (kcal)</figcaption>
      </figure>
      <figure className="ring-figure">
        <GoalRing
          label={`Protein ${when}`}
          value={`${formatInt(p)} g`}
          goal={proteinGoalG == null ? null : `av ${formatInt(proteinGoalG)} g`}
          fraction={proteinGoalG ? p / proteinGoalG : 0}
          tone="protein"
          testId="protein-ring"
        />
        <figcaption>Protein</figcaption>
      </figure>
    </>
  );
}
