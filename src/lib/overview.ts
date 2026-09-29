import type { Profile } from '../db/db.ts';
import {
  bmi,
  emaTrend,
  forecastGoal,
  goalProgress,
  type DailyWeight,
  type GoalForecast,
  type GoalProgress,
} from './stats.ts';

/** Vilken vikt Översikts härledda värden räknas på. */
export type WeightSource = 'trend' | 'dag';

export interface OverviewStats {
  /** Källan som faktiskt används (trend kräver minst en vägning). */
  source: WeightSource;
  /** Vikten alla härledda värden räknas på. */
  weightKg: number;
  /** Senaste dagsvikten (startvikten utan vägning). */
  dailyKg: number;
  /** Trendvikten (EMA) på senaste vägningsdagen, `null` utan vägning. */
  trendKg: number | null;
  /** Senaste vägningsdagen. */
  latestDate: string | null;
  /** Förändring mot startvikten, kvar till mål och andel av vägen. */
  progress: GoalProgress;
  bmi: number | null;
  forecast: GoalForecast;
}

/**
 * Översikts nyckeltal. Förändring (mot startvikten), kvar till mål, framsteg i %, BMI och
 * prognosens utgångsvikt räknas alla på samma vikt: trendvikten när den är huvudsiffran,
 * annars senaste dagsvikten.
 */
export function overviewStats({
  profile,
  daily,
  today,
  preferTrend,
}: {
  profile: Pick<Profile, 'startWeightKg' | 'goalWeightKg' | 'heightCm' | 'goalDate'>;
  daily: readonly DailyWeight[];
  today: string;
  preferTrend: boolean;
}): OverviewStats {
  const latest = daily[daily.length - 1];
  const dailyKg = latest?.weightKg ?? profile.startWeightKg;
  const trendKg = emaTrend(daily).at(-1)?.trendKg ?? null;
  const source: WeightSource = preferTrend && trendKg != null ? 'trend' : 'dag';
  const weightKg = source === 'trend' && trendKg != null ? trendKg : dailyKg;
  return {
    source,
    weightKg,
    dailyKg,
    trendKg,
    latestDate: latest?.date ?? null,
    progress: goalProgress(profile.startWeightKg, weightKg, profile.goalWeightKg),
    bmi: bmi(weightKg, profile.heightCm),
    forecast: forecastGoal({
      daily,
      goalKg: profile.goalWeightKg,
      today,
      goalDate: profile.goalDate,
      fromKg: latest ? weightKg : undefined,
    }),
  };
}
