import { useState, type ComponentType } from 'react';
import { BottomSheet } from '../components/BottomSheet.tsx';
import { Glp1Log } from '../components/Glp1Log.tsx';
import { Page } from '../components/Page.tsx';
import { StepsForm } from '../components/StepsForm.tsx';
import { WaistLog } from '../components/WaistLog.tsx';
import { WaterLog } from '../components/WaterLog.tsx';
import { WeightLog } from '../components/WeightLog.tsx';
import { WorkoutLog } from '../components/WorkoutLog.tsx';
import { todayIso } from '../lib/dates.ts';
import type { FeatureGated } from '../lib/features.ts';
import { useFeatures } from '../lib/features.ts';
import {
  formatCm,
  formatInt,
  formatKg,
  formatMg,
  formatMl,
  formatShortDate,
} from '../lib/format.ts';
import { nextDose } from '../lib/glp1.ts';
import { useAppData, type AppData } from '../lib/useAppData.ts';
import { useHashRoute } from '../lib/useHashRoute.ts';
import { drinkOn, waterGoal } from '../lib/water.ts';
import { upcomingWorkouts, workoutsBetween } from '../lib/workouts.ts';

type LogTypeId = 'vikt' | 'midja' | 'steg' | 'vatten' | 'traning' | 'glp1';

interface LogFormProps {
  data: AppData;
  reload: () => Promise<AppData>;
}

interface LogType extends FeatureGated {
  id: LogTypeId;
  label: string;
  /** Rubrik på panelen. */
  title: string;
  /** SVG-path för ikonen (24×24, streck). */
  icon: string;
  /** Kort status på rutan, t.ex. senaste värdet. */
  summary: (data: AppData) => string;
  Form: ComponentType<LogFormProps>;
}

/** Loggtyperna i rutnätet, i visningsordning. Funktionsbrytarna styr vilka som visas. */
const LOG_TYPES: readonly LogType[] = [
  {
    id: 'vikt',
    label: 'Vikt',
    title: 'Logga vikt',
    icon: 'M6 20h12l-2-12H8zM9 8a3 3 0 0 1 6 0',
    summary: ({ weights }) => {
      const latest = weights[weights.length - 1];
      return latest ? `Senast ${formatKg(latest.weightKg)}` : 'Inget loggat';
    },
    Form: ({ data, reload }) => (
      <WeightLog weights={data.weights} profile={data.profile} onChange={reload} />
    ),
  },
  {
    id: 'midja',
    label: 'Midja',
    title: 'Logga midjemått',
    icon: 'M4 9c4 2 12 2 16 0M4 15c4 2 12 2 16 0M4 9v6M20 9v6',
    feature: 'midja',
    summary: ({ waist }) => {
      const latest = waist[waist.length - 1];
      return latest ? `Senast ${formatCm(latest.waistCm)}` : 'Inget loggat';
    },
    Form: ({ data, reload }) => <WaistLog waist={data.waist} onChange={reload} />,
  },
  {
    id: 'steg',
    label: 'Steg',
    title: 'Logga steg',
    icon: 'M8 4c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM16 10c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z',
    feature: 'steg',
    summary: ({ steps }) => {
      const today = steps.find((s) => s.date === todayIso());
      return today ? `Idag ${formatInt(today.steps)}` : 'Inget idag';
    },
    Form: ({ data, reload }) => <StepsForm steps={data.steps} onChange={reload} />,
  },
  {
    id: 'vatten',
    label: 'Dryck',
    title: 'Logga dryck',
    icon: 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z',
    feature: 'vatten',
    summary: (data) => {
      const today = todayIso();
      const goal = waterGoal({ profile: data.profile, workouts: data.workouts, date: today });
      const ml = formatMl(drinkOn(data.water, data.foodLog, today).ml);
      return `Idag ${ml} av ${formatMl(goal.ml)}`;
    },
    Form: ({ data, reload }) => <WaterLog data={data} onChange={reload} />,
  },
  {
    id: 'traning',
    label: 'Träning',
    title: 'Träning',
    icon: 'M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12',
    feature: 'traning',
    summary: ({ workouts, workoutPlans }) => {
      const today = todayIso();
      const todays = workoutsBetween(workouts, workoutPlans, today, today);
      if (todays.length > 0) {
        const done = todays.filter((w) => w.status === 'genomford').length;
        return `Idag ${String(done)} av ${String(todays.length)} klara`;
      }
      const next = upcomingWorkouts(workouts, workoutPlans, new Date(), 1)[0];
      return next ? `Nästa: ${next.type}` : 'Inget planerat';
    },
    Form: ({ data, reload }) => <WorkoutLog data={data} onChange={reload} />,
  },
  {
    id: 'glp1',
    label: 'GLP-1',
    title: 'GLP-1',
    icon: 'M14 4l6 6M17 7l-9 9-3 1 1-3 9-9M8 13l3 3M3 21l3-3',
    feature: 'glp1',
    summary: ({ medications, injections }) => {
      if (medications.length === 0) return 'Lägg in läkemedel';
      const next = nextDose(medications, injections, new Date());
      if (!next) return 'Inget planerat';
      const dose = next.doseMg == null ? '' : ` ${formatMg(next.doseMg)}`;
      return next.date === todayIso()
        ? `Idag${dose}`
        : `Nästa ${formatShortDate(next.date)}${dose}`;
    },
    Form: ({ data, reload }) => <Glp1Log data={data} onChange={reload} />,
  },
];

export function Logga() {
  const { data, reload } = useAppData();
  const features = useFeatures();
  const { sub } = useHashRoute();
  const types = features.filter(LOG_TYPES);
  // "#/logga/glp1" öppnar panelen direkt (t.ex. från dosdagsbannern på Översikt).
  const [openId, setOpenId] = useState<LogTypeId | null>(
    () => types.find((t) => t.id === sub)?.id ?? null,
  );
  const open = types.find((t) => t.id === openId);

  return (
    <Page title="Logga">
      <ul className="log-grid" aria-label="Vad vill du logga?">
        {types.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className="log-tile"
              aria-haspopup="dialog"
              data-testid={`log-tile-${t.id}`}
              onClick={() => {
                setOpenId(t.id);
              }}
            >
              <svg
                className="log-tile-icon"
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d={t.icon} />
              </svg>
              <span className="log-tile-label">{t.label}</span>
              {data && <span className="log-tile-summary">{t.summary(data)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {data && open && (
        <BottomSheet
          title={open.title}
          onClose={() => {
            setOpenId(null);
            if (sub) window.history.replaceState(null, '', '#/logga');
          }}
        >
          <open.Form data={data} reload={reload} />
        </BottomSheet>
      )}
    </Page>
  );
}
